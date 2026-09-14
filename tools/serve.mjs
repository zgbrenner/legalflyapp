import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../',process.env.SERVE_DIST==='1'?'dist':'site'));
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.svg':'image/svg+xml','.bin':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Read-only static server.');return;}
 try{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/index.html';
  const candidate=path.resolve(root,'.'+name);
  if(!candidate.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  const file=await realpath(candidate);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  const info=await stat(file);if(!info.isFile())throw Error('Not a file');
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Length',info.size);
  res.setHeader('Cache-Control',file.endsWith('.bin')?'public, max-age=86400':'no-cache');
  if(req.method==='HEAD'){res.end();return;}
  const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`The Village Lawyer: http://${host}:${port}`));
