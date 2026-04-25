import http from 'node:http'

const PORT = Number(process.env.PORT ?? 3000)

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    message: 'Hello from Brimble!',
    path: req.url,
    host: req.headers.host,
    ts: new Date().toISOString(),
  }))
})

server.listen(PORT, () => {
  console.log(`sample-app listening on :${PORT}`)
})
