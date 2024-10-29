function log() {
  var args = Array.prototype.slice.call(arguments)
  var cleanArgs = args
  console.log.apply(console.log, cleanArgs)
}

export default log