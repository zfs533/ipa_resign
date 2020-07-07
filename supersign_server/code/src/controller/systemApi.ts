import { NextFunction, Request, Response } from "express";
import { ErrCode } from "../common/codeMsg";
import { systemLogDAO } from "../models/systemLogDao";
import { getBJDate, getChangeDate, bindExpress } from "../common/utils";
import { ipBlackListDao } from "../models/blackIPListDao";
import { getSysLogMap } from "../common/requestSchemaMap";

class SystemApi {

    /**
     * 添加ip白名单
     * ip
     */
    public addWhitelist = async (req: Request, res: Response) => {
        let ip = req.body;
        let result = await ipBlackListDao.getWhitelistByIp(ip.ip);
        if (result.code !== ErrCode.OK) {
            res.send(result);
            return;
        }
        let dbIp = result.msg
        if (dbIp) {
            res.send({ code: ErrCode.BadRequest, err: "已存在该IP" });
            return;
        } else {
            let result = await ipBlackListDao.addWhitelist(ip.ip);
            if (result.code !== ErrCode.OK) {
                res.send(result);
                return;
            }
            res.send({ code: ErrCode.OK, msg: "添加成功" });
        }
    }
    /**
     * 删除ip白名单
     * ip
     */
    public deleteWhitelist = async (req: Request, res: Response) => {
        let ip = req.body;
        let result = await ipBlackListDao.deleteWhitelist(ip._id);
        if (result.code !== ErrCode.OK) {
            res.send(result);
            return;
        }
        res.send({ code: ErrCode.OK, msg: "删除成功" });
    }
    /**
     * 修改IP白名单
     * ip
     * id
     */
    public updateWhitelist = async (req: Request, res: Response) => {
        let ip = req.body;
        let result = await ipBlackListDao.getWhitelistByIp(ip.ip);
        if (result.code !== ErrCode.OK) {
            res.send(result);
            return;
        }
        let dbIp = result.msg
        if (dbIp) {
            res.send({ code: ErrCode.BadRequest, err: "已存在该IP" });
        } else {
            let result = await ipBlackListDao.updateWhitelist(ip.id, ip);
            if (result.code !== ErrCode.OK) {
                res.send(result);
                return;
            }
            res.send({ code: ErrCode.OK, msg: "修改成功" });
        }
    }
    /**
     * 查询IP白名单
     * pageNo
     * pageSize
     */
    public pageWhitelist = async (req: Request, res: Response) => {
        let body = req.body;
        let pageNum = body.pageNo;
        let pageSize = body.pageSize;
        if (!pageNum || pageNum < 0) {
            res.send({ code: ErrCode.BadRequest });
            return;
        }
        if (!pageSize || pageSize < 0) {
            res.send({ code: ErrCode.BadRequest });
            return;
        }
        let result = await ipBlackListDao.totalWhitelist();
        if (result.code !== ErrCode.OK) {
            res.send(result);
            return;
        }
        let total = result.msg;
        if (total > 0) {
            let result = await ipBlackListDao.pageWhitelist(pageNum, pageSize);
            if (result.code !== ErrCode.OK) {
                res.send(result);
                return;
            }
            let data = result.msg;
            res.send({ code: ErrCode.OK, msg: { total: total, list: data } });
        } else {
            res.send({ code: ErrCode.OK, msg: { total: total, list: [] } });
        }
    }

    /**
    * 日志列表
    * pageNo
    * pageSize
    * orderBy.value?desc
    */
    public pageLog = async (req: Request, res: Response) => {
        let resultV = bindExpress(req, getSysLogMap);
        if (resultV.error) {
            res.send({ code: ErrCode.BadRequest, err: resultV.error });
            return;
        }
        let cond: any = { isshow: 1 };
        let pageNum = resultV.value.pageNo;
        let pageSize = resultV.value.pageSize;
        if (resultV.value.loginName) {
            cond.loginName = resultV.value.loginName;
        }
        if (resultV.value.startTime && resultV.value.endTime) {
            cond.createDate = { $gte: getBJDate(resultV.value.startTime), $lte: getBJDate(resultV.value.endTime) };
        }
        if (resultV.value.uri) {
            cond.uri = resultV.value.uri;
        }
        if (resultV.value.discription) {
            cond.discription = resultV.value.discription;
        }

        if (!pageNum || pageNum < 1) {
            res.send({ code: ErrCode.BadRequest, err: "页数不能小于1" });
            return;
        }
        if (!pageSize || pageSize < 1) {
            res.send({ code: ErrCode.BadRequest, err: "每页显示不能小于1" });
            return;
        }

        let result = await systemLogDAO.getTotal(cond);
        if (result.code !== ErrCode.OK) {
            res.send(result);
            return;
        }
        let total = result.msg;
        if (total >= 0) {
            let sort = { createDate: -1 };
            let logs = await systemLogDAO.pageLog(pageNum, pageSize, cond, sort, { loginName: 1, ip: 1, uri: 1, action: 1, createDate: 1, discription: 1 });
            let data = logs.msg;
            res.send({ code: ErrCode.OK, msg: { total: total, list: data } });
        } else {
            res.send({ code: ErrCode.OK, msg: { total: total, list: [] } });
        }
    }

}

export const systemApi = new SystemApi();