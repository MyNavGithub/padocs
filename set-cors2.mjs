/**
 * set-cors.mjs
 */
import fs from 'fs'
import path from 'path'
import https from 'https'

const BUCKET = 'padocs-vit-2026.appspot.com'

async function tryWithToken(token) {
    const corsConfig = JSON.stringify({
        cors: [{
            origin: ['*'],
            method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
            responseHeader: [
                'Content-Type', 'Authorization', 'Content-Length',
                'X-Requested-With', 'x-goog-resumable',
            ],
            maxAgeSeconds: 3600,
        }]
    })

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'storage.googleapis.com',
            path: `/storage/v1/b/${encodeURIComponent(BUCKET)}?fields=cors`,
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(corsConfig),
            },
        }, res => {
            let body = ''
            res.on('data', d => body += d)
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('✅ CORS updated on bucket:', BUCKET)
                    resolve()
                } else {
                    reject(new Error(`Storage API error ${res.statusCode}: ${body}`))
                }
            })
        })
        req.on('error', reject)
        req.write(corsConfig)
        req.end()
    })
}

(async () => {
    try {
        const configPath = path.join(process.env.USERPROFILE || process.env.HOME, '.config', 'configstore', 'firebase-tools.json')
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const token = data.tokens?.access_token
        if (!token) throw new Error('No access_token found in firebase-tools.json')

        console.log('Using cached access_token...')
        await tryWithToken(token)
    } catch (e) {
        console.error('❌ Error:', e.message)
        process.exit(1)
    }
})()
