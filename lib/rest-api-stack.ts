import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { generateBatch } from "../shared/util";
import { movieReviews } from "../seed/movies";
import * as apig from "aws-cdk-lib/aws-apigateway";

export class RestAPIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Table
    const movieReviewsTable = new dynamodb.Table(this, "MovieReviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER }, //MovieID is the primary key
      sortKey: { name: "reviewDate", type: dynamodb.AttributeType.STRING }, //reviewDate is the sort key
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "MovieReview",
    });


    // Functions 

    const getReviewByIdFn = new lambdanode.NodejsFunction(
      this,
      "GetReviewsByIdFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/getReviewById.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: movieReviewsTable.tableName,
          REGION: 'eu-west-1',
        },
      }
      );

      const getAllReviewsFn = new lambdanode.NodejsFunction(
        this,
        "GetAllReviewsFn",
        {
          architecture: lambda.Architecture.ARM_64,
          runtime: lambda.Runtime.NODEJS_16_X,
          entry: `${__dirname}/../lambdas/getAllReviews.ts`,
          timeout: cdk.Duration.seconds(10),
          memorySize: 128,
          environment: {
            TABLE_NAME: movieReviewsTable.tableName,
            REGION: 'eu-west-1',
          },
        }
        );

    const addMovieReviewsFn = new lambdanode.NodejsFunction(
      this,
      "AddMovieReviewsFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/addMovieReviews.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: movieReviewsTable.tableName,
          REGION: "eu-west-1",
        },
      }
    );

    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [movieReviewsTable.tableName]: generateBatch(movieReviews),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [movieReviewsTable.tableArn],  // Includes movie reviews
      }),
    });

    // Permissions 
    movieReviewsTable.grantReadWriteData(addMovieReviewsFn)
    movieReviewsTable.grantReadWriteData(getReviewByIdFn)
    movieReviewsTable.grantReadData(getAllReviewsFn)
    
    // REST API 
    const api = new apig.RestApi(this, "RestAPI", {
      description: "Assignment 1 API",
      deployOptions: {
        stageName: "dev",
      },
      // 👇 enable CORS
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });

    const moviesEndpoint = api.root.addResource("movies");
    const movieEndpoint = moviesEndpoint.addResource("{movieId}");
    const reviewsEndpoint = moviesEndpoint.addResource("reviews");
    const reviewEndpoint = movieEndpoint.addResource("reviews");
    const reviewerNameEndpoint = reviewEndpoint.addResource("{reviewerName}");

    reviewsEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(addMovieReviewsFn, { proxy: true })
    );

    reviewEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getReviewByIdFn, { proxy: true })
    );
    reviewerNameEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getReviewByIdFn, { proxy: true })
    )
  }
}