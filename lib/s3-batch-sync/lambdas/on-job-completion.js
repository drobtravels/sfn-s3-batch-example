const DDB = require('aws-sdk/clients/dynamodb')
const SFN = require('aws-sdk/clients/stepfunctions')
const S3Control = require('aws-sdk/clients/s3control')
const util = require('util')

const dynamoDB = new DDB.DocumentClient()
const sfn = new SFN()
const s3Control = new S3Control()

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

  if (event.status !== 'Complete' || event.failureCodes.length > 0) {
    console.log('sending failure due to event')
    return sfn.sendTaskFailure({
      taskToken,
      cause: JSON.stringify(event)
    }).promise()
  }

  const { Job } = await s3Control.describeJob({ 
    AccountId: process.env.ACCOUNT_ID,
    JobId: event.jobId
  }).promise()

  console.log('retrieved job description', util.inspect(Job, { depth: null }))

  const progressSummary = Job.ProgressSummary

  const jobDetails = JSON.stringify(Object.assign({ progressSummary }, event))

  if (progressSummary.NumberOfTasksFailed > 0) {
    console.log('sending failure on individual items')
    return sfn.sendTaskFailure({
      taskToken,
      error: 'ItemsFailed',
      cause: jobDetails
    }).promise()
  }

  console.log('sending failure')
  
  return sfn.sendTaskSuccess({
    taskToken,
    output: jobDetails
  }).promise()
}