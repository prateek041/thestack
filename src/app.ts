import { config as loadEnv } from 'dotenv'

loadEnv()

import '@/boot'
import { pushToQueue } from '@/lib/queue'
import { client as redisClient } from '@/lib/redis'
import { router } from '@/lib/router'
import bodyParser from 'body-parser'
import compression from 'compression'
import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import expressLimiter from 'express-limiter'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'
import serveStatic from 'serve-static'
import cookieParser from 'cookie-parser'
import { initDocs } from './docs'

export const app = express()

export const initApp = ({ db }) => {
  // TODO: configure proper cors here
  app.use(cors())

  // Common defaults
  app.disable('x-powered-by')
  app.use(morgan('tiny'))
  app.use(helmet())
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(bodyParser.json())
  app.use(cookieParser())
  app.use(
    compression({
      filter: (req, res) => {
        return Boolean(req.headers['x-no-compression'])
      },
    })
  )

  app.use('/public', serveStatic(path.join(__dirname, './public')))

  // Basic Rate limiter
  // TODO: change in the lookup and
  // expiry / total combination according to your usecase
  const limiter = expressLimiter(router, redisClient)
  app.use(
    limiter({
      path: '*',
      method: 'all',
      lookup: ['headers.x-forwarded-for', 'connection.remoteAddress'],
      // 1000 request / 5 mins
      total: 1000,
      expire: 1000 * 60 * 5,
    })
  )

  initDocs(app)

  app.use(extender(db))
  app.use(router)

  return app
}

const extender = db => (req: Request, res: Response, n: NextFunction) => {
  req.db = db
  req.pushToQueue = pushToQueue
  n()
}
