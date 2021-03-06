const { EventEmitter } = require('events')
const { Scheduler } = require('@pown/request/lib/scheduler')
const { eachOfLimit } = require('@pown/async/lib/eachOfLimit')

const db = require('./db')

const scheduler = new Scheduler()

class WhoAreThey extends EventEmitter {
    constructor() {
        super()

        this.headers = {
            'User-Agent': 'Pown'
        }
    }

    log(...args) {
        this.emit('log', ...args)
    }

    info(...args) {
        this.emit('info', ...args)
    }

    warn(...args) {
        this.emit('warn', ...args)
    }

    error(...args) {
        this.emit('error', ...args)
    }

    buildTransaction(account, site) {
        return { method: 'GET', uri: site.check_uri.replace('{account}', account), headers: { ...this.headers, ...site.check_headers }, timeout: 10000, site, account }
    }

    * generateTransactions(account) {
        const { sites } = db

        for (const site of sites) {
            const { valid } = site

            if (!valid) {
                continue
            }

            yield this.buildTransaction(account, site)
        }
    }

    accountExists(site, response) {
        const { account_existence_code, account_existence_string, account_missing_code, account_missing_string } = site

        const { responseCode, responseBody } = response

        const responseBodyString = responseBody.toString()

        if (!((responseCode == account_existence_code) && (responseBodyString.indexOf(account_existence_string) >= 0))) {
            return false
        }

        if (((responseCode == account_missing_code) && (responseBodyString.indexOf(account_missing_string) >= 0))) {
            return false
        }

        return true
    }

    async fingerprint(account) {
        const results = []

        await eachOfLimit(this.generateTransactions(account), Number.MAX_SAFE_INTEGER, async({ site, ...req }) => {
            const { name, category, pretty_uri } = site

            this.warn(`Checking account at ${req.uri}`)

            const { uri, ...res } = await scheduler.request(req)

            if (this.accountExists(site, res)) {
                const prettyUri = pretty_uri ? pretty_uri.replace('{account}', account) : uri

                this.warn(`Account found at ${uri} <-> ${prettyUri}`)

                results.push({ name, category, uri, prettyUri })
            }
        })

        return results
    }
}

module.exports = { WhoAreThey }
