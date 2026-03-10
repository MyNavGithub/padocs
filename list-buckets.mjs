import fs from 'fs'
import path from 'path'
import https from 'https'

const PROJECT = 'padocs-vit-2026'

async function tryWithToken(token) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'storage.googleapis.com',
            path: `/storage/v1/b?project=${PROJECT}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            },
        }, res => {
            let body = ''
            res.on('data', d => body += d)
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('Buckets:', body)
                    resolve()
                } else {
                    reject(new Error(`Storage API error ${res.statusCode}: ${body}`))
                }
            })
        })
        req.on('error', reject)
        req.end()
    })
}

(async () => {
    try {
        const configPath = path.join(process.env.USERPROFILE || process.env.HOME, '.config', 'configstore', 'firebase-tools.json')
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const token = data.tokens?.access_token
        if (!token) throw new Error('No access_token found in firebase-tools.json')

        await tryWithToken(token)
    } catch (e) {
        console.error('❌ Error:', e.message)
        process.exit(1)
    }
})()
