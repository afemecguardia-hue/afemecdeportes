const http = require('http');
const fs = require('fs');
const path = require('path');

try { require('dotenv').config(); } catch {}
const PORT = process.env.STATIC_PORT || process.env.PORT || 3045;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url.split('?')[0]; // Excluir query params como ?v=...
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // Si es un archivo de asset inexistente, devolver 404
                if (extname !== '' && extname !== '.html') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File Not Found');
                } else {
                    // Fallback a index.html para SPA routing
                    fs.readFile('./index.html', (err, htmlContent) => {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(htmlContent, 'utf-8');
                    });
                }
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
