const DDB = require('aws-sdk/clients/dynamodb')
const SFN = require('aws-sdk/clients/stepfunctions')

const dynamoDB = new DDB.DocumentClient()
const sfn = new SFN()

const getTaskToken = async (JobId) => {
  const params = {
    TableName: process.env.JOB_TABLE_NAME,
    Key: {
      JobId
    }
  }

  console.log('fetching task token from dynamodb', params)
  const response = await dynamoDB.get(params).promise()
  console.log('dynamo response', response)
  return response.Item.TaskToken
}

exports.handler = async function (event) {
  console.log('invoked with', event)

  const taskToken = await getTaskToken(event.jobId)

  let response

  if (event.status == 'Complete' && event.failureCodes.length < 1) {
    console.log('sending success')
    resposne = await sfn.sendTaskSuccess({
      taskToken,
      output: JSON.stringify(event)
    }).promise()
  } else {
    console.log('sending failure')
    response = await sfn.sendTaskFailure({
      taskToken,
      cause: JSON.stringify(event)
    })
  }
  
  console.log('response', response)
}