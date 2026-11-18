const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{let relative;try{relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Bad request');}const file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end('Forbidden');}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);});});
server.on('error',err=>{console.error(err.code==='EADDRINUSE'?'端口 18646 已占用，请尝试打开 http://127.0.0.1:18646/ 或关闭占用服务。':err.message);process.exitCode=1;});
server.listen(18646,'127.0.0.1',()=>console.log('本地预览：http://127.0.0.1:18646/ （仅本机访问）'));
