import { Request, Response } from "express";
import { bindExpress, removeDir, getChangeDate } from "../common/utils";
import { ErrCode } from "../common/codeMsg";
import { getAccountMap, addNewAccountMap, deleteAccountMap, getYanZhengCodeMap } from "../common/requestSchemaMap";
import { SignActReq, signActDao, SignActModel, AccountStatus } from "../models/signActDao";
import { shCmdHelper } from "../helper/shCmdHelper";
import { logger } from "../common/logger";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "log4js";


class AccountApi {
    get = async (req: Request, res: Response) => {
        let result = bindExpress(req, getAccountMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "您当前的操作使记录不完整，请重新操作：" + result.error });
            return;
        }
        let cond: any = { status: AccountStatus.Normal, blocked: { $ne: 1 } }
        if (result.value.status && result.value.status.length > 0) {
            if (result.value.status != AccountStatus.Blocked) {
                if (result.value.status == AccountStatus.Free) {
                    cond.user = null;
                }
                else {
                    cond.status = result.value.status;
                }
            }
            else {
                cond = { blocked: 1 };
            }
        }
        if (result.value.act && result.value.act.length > 0) {
            cond.act = result.value.act;
        }
        logger.info(cond);
        let ret = await Promise.all([
            signActDao.getList(cond, result.value.page, result.value.count),
            signActDao.getActCount(cond),
            signActDao.getActCount(cond),
        ]);
        let errIdx = ret.findIndex(e => e.code !== ErrCode.OK);
        if (errIdx >= 0) {
            return ret[errIdx];
        }
        //账号不足10个土豆预警
        // if (ret[2].msg || ret[2].msg < 10) {
        //     toMonitorGroup(`超级签可用账号还剩${ret[2].msg}个,已严重不足,请管理员马上添加账号！！！`);
        // }
        //canDo  可用账号数量
        let data: SignActModel[] = ret[0].msg.map(e => {
            return {
                act: e.act,
                pwd: e.pwd,
                status: e.status,      //枚举   Normal   NoLogin   Full   OtherProblem
                user: e.user,
                deviceCount: e.deviceCount ? e.deviceCount : 0,
                expired: e.expired,
                addTime: e.addTime,
            }
        })
        res.send({ code: ErrCode.OK, msg: { data: data, total: ret[1].msg, canDo: ret[2].msg } });
    }

    /* 允许多个管理员同时添加，同时避免重复添加账号 */
    private accountList: any[] = [];
    private isAddFinished(appleAccount: string): boolean {
        let isNotFinish = this.accountList.find((element: string) => { return element == appleAccount });
        return isNotFinish;
    }
    private saveAccount(appleAccount: string): void {
        this.accountList.push(appleAccount);
    }

    private deleteAccount(appleAccount: string): void {
        for (let i = 0; i < this.accountList.length; i++) {
            if (this.accountList[i] == appleAccount) {
                this.accountList.splice(i, 1);
                break;
            }
        }
    }

    add = async (req: Request, res: Response) => {
        let result = bindExpress(req, addNewAccountMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "您当前的操作使记录不完整，请重新操作：" + result.error });
            return;
        }
        let cond = result.value as SignActModel;
        if (this.isAddFinished(cond.act)) {
            logger.error("当前操作尚未完成，请稍等:");
            res.send({ code: ErrCode.ReAddAccount, err: "当前操作尚未完成，请稍等" });
            return;
        }
        this.saveAccount(cond.act);
        let appleAccount = await signActDao.getOneByAct(cond.act);
        if (appleAccount.msg) {
            this.deleteAccount(appleAccount.msg.act);
            logger.error("重复添加账号:" + appleAccount.msg.act);
            res.send({ code: ErrCode.ReAddAccount, err: "请不要重复添加签名账号" });
            return;
        }
        cond.status = AccountStatus.Normal;
        let timeDate = await shCmdHelper.runCmd_GetAppleAccount_AddTime(cond.act);
        cond.addTime = timeDate.msg;
        //添加新账号后还需要使用脚本添加新账号的各种配置路径以及生成该账号证书
        let createPath = await shCmdHelper.runCmd_AddAccount(cond.act, cond.pwd, cond.user);
        if (createPath.code !== ErrCode.OK) {
            this.deleteAccount(cond.act);
            logger.error("添加账号对应路径及证书出错: ", JSON.stringify(createPath));
            res.send(createPath);
            return;
        }
        cond.user = null;
        let actList = await signActDao.addNewAccount(cond);
        this.deleteAccount(actList.msg.act);
        if (actList.code !== ErrCode.OK) {
            logger.error("Account awSignActDAO.addNewAccount err: ", JSON.stringify(actList));
            res.send(actList);
            return;
        }

        res.send({ code: ErrCode.OK });
    }

    delete = async (req: Request, res: Response) => {
        let result = bindExpress(req, deleteAccountMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "您当前的操作使记录不完整，请重新操作：" + result.error });
            return;
        }
        let act = result.value.act;
        //删除账号同时还需要删除账号相关的各种配置路径 
        let actPath = path.join(process.cwd(), `./data/account/${act}/`);
        let deleteCertifiacte = await shCmdHelper.runCmd_Delete_Certificate(actPath);
        if (deleteCertifiacte.code !== ErrCode.OK) {
            logger.error("删除证书错误: ", JSON.stringify(deleteCertifiacte));
            res.send(deleteCertifiacte);
            return;
        }
        if (fs.existsSync(actPath)) {
            removeDir(actPath);
        }

        logger.info("shCmdHelper removeDir ok");

        let deleteRet = await signActDao.deleteAccount(result.value._id);
        res.send(deleteRet);
    }

    /**
     * 苹果账号登录验证码
     * @param req 
     * @param res 
     */
    public async getYZCode(req: Request, res: Response) {
        let result = bindExpress(req, getYanZhengCodeMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "输入验证码格式错误" + result.error });
            return;
        }
        let yanZhengCode = result.value.yanzhengCode;
        let user = result.value.user;
        let filePath = path.join(process.cwd(), `data/code/${user}.txt`);
        fs.writeFile(filePath, yanZhengCode, (err) => {
            if (err) {
                res.send({ code: ErrCode.BadRequest, err: `写入验证码失败${yanZhengCode}:` + err });
                return;
            }
        });
        res.send({ code: ErrCode.OK, msg: "发送成功" });
    }

    public getActAddTime(list: any, appleAccount: string): any {
        let addTime = null;
        for (let i = 0; i < list.length; i++) {
            if (appleAccount == list[i].act) {
                let temp = list[i].time.split("-");
                let date = new Date(temp[0], temp[1] - 1, temp[2], 0, 0, 0, 0);
                addTime = getChangeDate(date);
                break;
            }
        }
        addTime = addTime || getChangeDate();
        return addTime;
    }

}
export const accountApi = new AccountApi();