exports.handler = async function (event) {
  console.log('processing file', event)
  return {
    invocationSchemaVersion: event.invocationSchemaVersion,
    treatMissingKeysAs: 'PermanantFailure',
    invocationId: event.invocationId,
    results: [
      {
        taskId: event.tasks[0].taskId,
        resultCode: 'Succeeded',
        resultString: JSON.stringify({ foo: 'bar' })
      }
    ]
  }
}