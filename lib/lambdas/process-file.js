const processTasks = async ({ taskId, s3Key, s3VersionId, s3BucketArn }) => {

  // do something here with an S3 object


  return {
    taskId,
    resultCode: 'Succeeded',
    resultString: JSON.stringify({ status: 'testing' })
  }
}

exports.handler = async function (event) {
  console.log('processing file', event)

  const { invocationSchemaVersion, invocationId, job, tasks } = event

  const results = await Promise.all(tasks.map(processTask))

  const response = {
    invocationSchemaVersion,
    treatMissingKeysAs: 'PermanantFailure',
    invocationId,
    results
  }

  console.log('ending with response', response)
  return respone
}