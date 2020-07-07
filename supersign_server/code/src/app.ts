import express = require("express")
import { Server } from "http";
import { logger } from "./common/logger";
import { timerMgr } from "./common/timeMgr";
import { globalCfg } from "./models/globalCfgDao";
import * as cookieParser from "cookie-parser";
import * as path from "path";
import bodyParser = require('body-parser');
import { router } from "./routers/routers";
import * as cors from "cors";
import { MongoDbUtil } from "./models/mongoDbUtil";
import { NextFunction, Request, Response } from "express";
import { ErrCode } from "./common/codeMsg";
import { JwtTokenUtil } from "./common/jwtTokenUtil";
import { systemLogDAO } from "./models/systemLogDao";
import { adminUserDao } from "./models/adminDao";
import { ipBlackListDao } from "./models/blackIPListDao";
//process.env.TZ = "Asia/Shanghai"
class App {
    private _server: Server;
    private anonApi: string[] = [
        "/sign",
        "/admin/login",
        // "/getUdidIpa",
        //"/downIpa",
        // "/isIpa",
    ];


    /** 拦截器*/
    public requestInterceptor = async (req: Request, res: Response, next: NextFunction) => {
        let x_real_ip = req.header('http_x_forwarded_for');
        if (!x_real_ip) {
            let ip = req.ip;
            let forwardFor = req.header('x-forwarded-for');
            if (forwardFor) {
                let ips = forwardFor.split(",");
                ip = ips[0];
            }
            req.headers['http_x_forwarded_for'] = ip;
        }
        let ip = req.get('http_x_forwarded_for');
        if (ip.substr(0, 7) == "::ffff:") {
            ip = ip.substr(7)
        }
        let path = req.path;
        let userMark;
        let pid = path.split("/")[1];
        //if (path !== "/" && pid !== "getUdidIpa" && pid !== "downIpa") {
        if (path !== "/" && pid !== "sign" && pid !== "downIpa") {
            if (ip === "localhost" || ip === "127.0.0.1" || ip === "::1") {
                logger.info("request " + path + " from localhost ip", ip);
            } else {
                let result = await ipBlackListDao.getWhitelistByIp(ip);
                if (result.code === ErrCode.OK) {
                    let dbIp = result.msg
                    if (dbIp) {
                        res.send({ code: ErrCode.IpRejected, err: "ip受限" });
                        return;
                    }
                } else {
                    res.send({ code: ErrCode.InternalServerError });
                    return;
                }
            }
            let anonymous = this.isAnonymous(path);
            if (!anonymous) {
                let token = req.header("Authorization");
                if (!token) {
                    res.send({ code: ErrCode.BadRequest, err: "BadRequest" });
                    return;
                } else {
                    userMark = JwtTokenUtil.getNameFromToken(token);
                    if (!userMark || userMark === undefined || userMark === "undefined") {
                        res.send({ code: ErrCode.InvalidToken, err: "InvalidToken" });
                        return;
                    }
                    let dbToken = await adminUserDao.getDbToken(path, userMark);
                    if (!dbToken) {
                        res.send({ code: ErrCode.MongoErr });
                        return;
                    }
                    if (token !== dbToken) {
                        res.send({ code: ErrCode.InvalidToken, err: "InvalidToken" });
                        return;
                    }
                    (req as any).adminUser = userMark;
                }
            }
        }
        try {
            //if (path !== "/" && pid !== "getUdidIpa" && pid !== "downIpa" && pid !== "isIpa") {
            if (path !== "/" && pid !== "sign" && pid !== "downIpa") {
                let data = req.body
                if (req.path.endsWith("/admin/login") || req.path.endsWith("/admin/addAccount")) {
                    data = { loginName: req.body.loginName, code: req.body.code }
                    if (!userMark) {
                        userMark = "anonymous"
                    }
                }

                systemLogDAO.addLoginLog(userMark, req.ip, req.path, data);
            }
        } catch (error) {
            logger.error(error);
        }
        next();
    }

    private isAnonymous = (path: string): boolean => {
        for (let index = 0; index < this.anonApi.length; index++) {
            const element = this.anonApi[index];
            if (path === element) {
                return true;
            }
        }
        return false;
    }

    public start = async () => {
        let app = express();
        logger.info(">initSyncModels...");

        let conn = await MongoDbUtil.initAllModels(globalCfg.dbUrl);
        if (!conn) {
            logger.error(">init dbLogUrl fail now exit...");
            process.exit(1);
        }
        logger.info(">initSyncModels finish...");

        // 设置模板引擎
        app.set("views", path.join(__dirname, "..", "views"));
        app.set("view engine", "ejs");

        app.use(cors({
            allowedHeaders: "*",
            origin: "*",
            exposedHeaders: "*",
            methods: "*",
            credentials: true,
        }))
        app.use(express.static(path.join(__dirname, "..", "public")));
        app.use(cookieParser());

        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.text());
        app.use(this.requestInterceptor);
        app.use("/", router);
        timerMgr.init();
        this._server = app.listen(globalCfg.port, () => {
            logger.info(">web start ...", globalCfg.port);
        })
    }
}

new App().start();