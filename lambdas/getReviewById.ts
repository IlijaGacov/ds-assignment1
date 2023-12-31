import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput, GetCommand } from "@aws-sdk/lib-dynamodb";


const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => { 
  try {
    console.log("Event: ", event);
    const parameters  = event?.pathParameters;
    const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
    const reviewerName = parameters?.reviewerName;
    const minRating = event?.queryStringParameters?.minRating;

    if (!movieId) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Invalid movie Id" }),
      };
    }

    let queryInput: QueryCommandInput = {
      TableName: process.env.TABLE_NAME!,
      KeyConditionExpression: "movieId = :m",
      ExpressionAttributeValues: {
        ":m": movieId,
      },
    };

    if (reviewerName) {
      queryInput = {
        ...queryInput,
        FilterExpression: "reviewerName = :name", // Filter if reviewerName exists
        ExpressionAttributeValues: {
          ...queryInput.ExpressionAttributeValues,
          ":name": reviewerName,
        },
      };
    }

    if (minRating !== undefined && !isNaN(parseFloat(minRating))) {
      queryInput = {
        ...queryInput,
        FilterExpression: "reviewRating >= :rating", 
        ExpressionAttributeValues: {
          ...queryInput.ExpressionAttributeValues,
          ":rating": parseFloat(minRating),
        },
      };
    }

    const commandOutput = await ddbDocClient.send(
      new QueryCommand(queryInput)
      );

      console.log("GetCommand response: ", commandOutput);
      if (!commandOutput.Items) {
        return {
          statusCode: 404,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ Message: "No reviews found" }),
        };
      }
      const body = {
        data: commandOutput.Items,
      };    

    // Return Response
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: commandOutput.Items,
      }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ error }),
    };
  }
};

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}