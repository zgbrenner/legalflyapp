import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {stat,readFile} from 'node:fs/promises';
const root=resolve(process.argv[2]||'dist'),port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.svg':'image/svg+xml','.gz':'application/octet-stream'};
createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try {
    const url=new URL(req.url,'http://localhost');let name=decodeURIComponent(url.pathname);
    if(name.includes('\0'))throw Error('Invalid path');
    let path=resolve(root,'.'+name);if(path!==root&&!path.startsWith(root+sep))throw Error('Invalid path');
    if((await stat(path)).isDirectory())path=resolve(path,'index.html');
    const content=await readFile(path);res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');
    res.setHeader('Cache-Control',path.includes(sep+'data'+sep)?'public, max-age=3600':'no-cache');
    res.writeHead(200);res.end(req.method==='HEAD'?undefined:content);
  }catch{res.writeHead(404);res.end('Not found. Prepare the complete site with npm run build.');}
}).listen(port,'127.0.0.1',()=>console.log(`Village Lawyer: http://127.0.0.1:${port}`));
