import { Request, Response } from "express";
import * as cookie from "cookie";
import { ErrCode, CodeMsgAny } from "../common/codeMsg";
import { logger } from "../common/logger";
import { ipaUdidHelper } from "../helper/ipaUdidHelper";
import { udidTokenLogDAO, Pid, UdidTokenModel } from "../models/udidTokenLogDao";
import { shCmdHelper } from "../helper/shCmdHelper";
import { ipaFilesDao, IpaStatus } from "../models/ipaFileDao";
import * as path from 'path';
import * as fs from "fs";
import { globalCfg } from "../models/globalCfgDao";
import { adminApi } from "./adminApi";
import { decryption } from "../common/aes";
import { allowUserDao, AllowUserModel } from "../models/allow_user";
import { signActDao } from "../models/signActDao";
import { relationDao } from "../models/relationDao";
import { createBundleId, removeDir } from "../common/utils";
import { adminUserDao } from "../models/adminDao";
import { activationDao } from "../models/activationDao";

class NewIpaApi {
    /* 用于处理已经购买过的老用户，忘记填写激活码了 */
    private emptyCode: string = "empty";
    //进入页面获取描述文件
    first = async (req: Request, res: Response) => {
        let pid = req.query.pid;
        let keyCode = req.query.code;
        let img = `${globalCfg.ipaDomain}/platform/${pid}/img512.png`;
        logger.info("pid==", pid, "keyCode===", keyCode);
        let ipaDoc = await ipaFilesDao.getDataByPid(pid);
        logger.info("==第一页面ipaDoc==>", ipaDoc)
        if (!ipaDoc || !ipaDoc.msg.length) {
            res.send({ code: ErrCode.BadRequest, err: "该平台已关闭" });
            return;
        }
        if (!ipaDoc.msg[0].enable || ipaDoc.msg[0].status == IpaStatus.Deleted) {
            res.send({ code: ErrCode.Unknown, err: "亲爱的玩家非常抱歉,该平台暂未开放,请联系客服" });
            return;
        }

        // 剩余下载次数为0时平台不开放
        let userData = await adminApi.getDataByUser(ipaDoc.msg[0].act);
        if (userData.code !== ErrCode.OK) {
            res.send(userData);
            return
        }
        if (userData.msg.laveNum < 1) {
            res.send({ code: ErrCode.Unknown, err: "亲爱的玩家非常抱歉,该平台暂未开放,请联系客服" });
            return;
        }
        let mobileName = "signed";
        let addRet, activationCode;
        // 是否用户验证
        if (ipaDoc.msg[0].isCheck) {
            // if (!keyCode) {
            //     res.send({ code: ErrCode.BadRequest, err: "无用户验证码" });
            //     return;
            // }
            activationCode = keyCode || this.emptyCode
            addRet = await shCmdHelper.runCmd_InitMobileConfig(pid, globalCfg.ipaDomain, ipaDoc.msg[0].ipaName, activationCode);
            mobileName = activationCode;
        }
        else {
            addRet = await shCmdHelper.runCmd_InitMobileConfig(pid, globalCfg.ipaDomain, ipaDoc.msg[0].ipaName);
        }
        if (addRet.code !== ErrCode.OK) {
            logger.error("更新mobileconfig出错: ", JSON.stringify(addRet));
            res.send(addRet);
            return;
        }

        res.render("vipPack.ejs", {
            pid: pid,
            img: img,
            ipaName: ipaDoc.msg[0].ipaName,
            score: ipaDoc.msg[0].score,
            ipaBrief: ipaDoc.msg[0].ipaBrief,
            mobileName: mobileName,
            appType: ipaDoc.msg[0].ipaType,
            size: (ipaDoc.msg[0].fileSize / 1024 / 1024).toFixed(2),
            mobileConfigName: ipaDoc.msg[0].isCheck ? activationCode : "signed"
        });
    }

    /**
     * 检查当前udid是否可以下载当前应用应用
     * @param udid 设备ID
     * @param pid 应用唯一标示
     * @param user 当前应用的上传者
     */
    public async handleEmptyCode(udid: string, pid: string, user: string): Promise<CodeMsgAny> {
        let re: any = { code: ErrCode.OK, msg: null }
        /* 找到udid对应的所有激活码 */
        let allowData = await allowUserDao.getManyByUdid(udid);
        if (allowData.code == ErrCode.OK && allowData.msg.length > 0) {
            let codeList = allowData.msg;
            /* 找到所有激活码对应的用户 */
            let codeData = await activationDao.aggregateUserListByCodeList(codeList);
            if (codeData.code == ErrCode.OK && codeData.msg.length > 0) {
                /* 判断该应用是否为当前用户上传 */
                re.msg = codeData.msg.find((element: any) => { return element == user });
                if (!re.msg) {
                    /* 判断用户合作应用中是否有当前应用 pid */
                    let userData = await adminUserDao.getUsersAppList(codeData.msg);
                    if (userData.code == ErrCode.OK && userData.msg.length > 0) {
                        re.msg = userData.msg.find((element: any) => { return element == pid });
                    }
                }
            }
        }
        return Promise.resolve(re);
    }

    //获取回调，得到udid
    getUdidIpa = async (req: Request, res: Response) => {
        let app = req.app;
        const ua = req.get("user-agent");
        if (ua !== "Profile/1.0") {
            res.sendStatus(403);
            return;
        }
        logger.info(">start get udid ", req.path, "ua: ", ua);
        //let pid = req.url.split("/")[3];
        let pid = req.params.pid;
        logger.info("回调请求:", req.url);
        let udidCM = await ipaUdidHelper.getReqUdid(req);
        if (udidCM.code !== ErrCode.OK) {
            logger.error("save udid err: " + udidCM.err);
            res.send({ code: ErrCode.BadRequest, err: "没有获取到udid" });
            return;
        }
        let udid = udidCM.msg;
        logger.info("获取当前udid:" + udid);
        let fileDoc = await ipaFilesDao.getByPid(pid);
        if (fileDoc.code !== ErrCode.OK) {
            res.send(fileDoc);
            return;
        }
        logger.info("fileDoc:", fileDoc);
        // 是否用户验证
        if (fileDoc.msg.isCheck && req.query.id != this.emptyCode) {
            let activationCode = req.query.id;
            let atcData = await activationDao.getUserByActivationCode(activationCode);
            logger.info("activationcode:" + activationCode);
            if (!atcData.msg) {
                /* 购买过的老用户，激活码填写错误，仍然可以下载 */
                let oldDate = await this.handleEmptyCode(udid, pid, fileDoc.msg.act);
                if (!oldDate.msg) {
                    res.send({ code: ErrCode.BadRequest, err: "亲爱的玩家非常抱歉,该平台暂未开放,请联系客服.." });
                    return;
                }
            }
            else {
                let user = atcData.msg.user;
                let isCoomparationApp = await adminUserDao.getPartner(user, pid);
                if (user != fileDoc.msg.act) {
                    /* 不是合作项目组，也不是合作应用 */
                    if (!isCoomparationApp.msg) {
                        res.send({ code: ErrCode.BadRequest, err: "亲爱的玩家非常抱歉,该平台暂未开放,请联系客服.." });
                        return;
                    }
                }
                let allowUser = await allowUserDao.getByActivationCode(activationCode);
                if (allowUser.code != ErrCode.OK) {
                    logger.error("获取allowUser数据失败 :" + JSON.stringify(allowUser));
                    return;
                }
                if (allowUser.msg) {
                    if (allowUser.msg.udid != udid) {
                        res.send({ code: ErrCode.BadRequest, err: "亲爱的玩家非常抱歉,该平台暂未开放,请联系客服..." });
                        return;
                    }
                }
                else {
                    /* 第一次，直接保存数据  */
                    await allowUserDao.insertOne(activationCode, udid);
                    /* 激活码标记为已使用 */
                    await activationDao.updateOne(activationCode, 1);
                }
            }
        }
        else if (req.query.id == this.emptyCode) {
            /* 购买过的老用户，忘记填写激活码了 */
            let oldDate = await this.handleEmptyCode(udid, pid, fileDoc.msg.act);
            if (!oldDate.msg) {
                res.send({ code: ErrCode.BadRequest, err: "亲爱的玩家非常抱歉,该平台暂未开放,请联系客服.." });
                return;
            }
        }
        let name = fileDoc.msg ? fileDoc.msg.ipaName : "最好的娱乐平台";
        let saveRet = await udidTokenLogDAO.saveUdidAndPid(udid, pid);
        if (saveRet.code !== ErrCode.OK) {
            res.send("网络错误");
            return;
        }
        let udidDoc = await udidTokenLogDAO.findOneByUdid(udid);
        if (udidDoc.code !== ErrCode.OK) {
            res.send(udidDoc);
            return;
        }
        let actDoc = await signActDao.getAccountList(fileDoc.msg.act);
        let udidCount = actDoc.msg[0];
        let appleAccount = udidCount.act;
        let passworld = udidCount.pwd;
        let bundleId = createBundleId(appleAccount);
        /* 查询老账号情况 */
        let relationData = await relationDao.getOneMonthOldAppleAccount(appleAccount, fileDoc.msg.act, udid);
        if (relationData.code == ErrCode.OK && relationData.msg) {
            appleAccount = relationData.msg.appleAccount;
            bundleId = relationData.msg.bundleId;
            passworld = relationData.msg.passworld;
            logger.info("------------创建描述文件使用的老账号------------")
        }
        let createMobileFile = await shCmdHelper.runCmd_RegisterDeviecNew(udid, appleAccount, passworld, bundleId, pid, udidCount.user);
        if (createMobileFile.code !== ErrCode.OK) {
            res.send(createMobileFile);
            return;
        }
        let cond: UdidTokenModel = {
            udid: udid,
            account: appleAccount,
        }
        let saveActAndUdid = await udidTokenLogDAO.editUdidModel(cond);
        if (saveActAndUdid.code !== ErrCode.OK) {
            return saveActAndUdid;
        }

        let ipaPath = path.join(process.cwd(), `./public/platform/${pid}/${appleAccount}/${udid}.ipa`);
        let ret = fs.existsSync(ipaPath);
        if (ret) await fs.unlinkSync(ipaPath)
        logger.info("updateIpa 请求 " + udid + ".ipa文件是否存在，目前状态为" + ret);

        actDoc = await signActDao.getAccountList(fileDoc.msg.act);
        udidCount = actDoc.msg[0];
        appleAccount = udidCount.act;
        passworld = udidCount.pwd;
        bundleId = createBundleId(appleAccount);
        /* 查询老账号情况 */
        relationData = await relationDao.getOneMonthOldAppleAccount(appleAccount, fileDoc.msg.act, udid);
        if (relationData.code == ErrCode.OK && relationData.msg) {
            appleAccount = relationData.msg.appleAccount;
            bundleId = relationData.msg.bundleId;
            passworld = relationData.msg.passworld;
            logger.info("------------创建描述文件使用的老账号------------")
        }

        let redirectUrl = `/downIpa?udid=${udid}&pid=${pid}&act=${appleAccount}&user=${fileDoc.msg.act}`
        logger.info("newIpaApi getUdid redirect ", redirectUrl);
        res.redirect(301, redirectUrl);
        logger.info(">start resign ipa...");

        let signIpa = await shCmdHelper.runCmd_Isign(pid, appleAccount, udid, name, bundleId);
        this.deleteMobileProvision(appleAccount, udid, fileDoc.msg);
        if (signIpa.code !== ErrCode.OK) {
            let packZipPath = path.join(process.cwd(), `data/package/${pid}/${udid}`);
            removeDir(packZipPath);
            logger.error("重签名ipa文件出错: " + JSON.stringify(signIpa));
            res.sendStatus(500);
            return;
        }
    }

    /**
     * 签名完成删除描述文件
     * @param appleAccount 
     * @param udid 
     * @param ipaData 
     */
    private deleteMobileProvision(appleAccount: string, udid: string, ipaData: any): void {
        let mobileProvisions: any[] = [];
        let bundleId = createBundleId(appleAccount);
        let last = udid + ".mobileprovision"
        mobileProvisions.push(ipaData.oriBundle + bundleId + last);
        for (let i = 0; i < ipaData.extentions.length; i++) {
            mobileProvisions.push(ipaData.oriBundle + bundleId + "." + ipaData.extentions[i] + last);
        }
        for (let j = 0; j < mobileProvisions.length; j++) {
            let packZipPath = path.join(process.cwd(), `data/account/${appleAccount}/${mobileProvisions[j]}`);
            if (fs.existsSync(packZipPath)) {
                fs.unlinkSync(packZipPath);
            }
        }
    }

    //重签名完成，进入下载
    downIpa = async (req: Request, res: Response) => {
        //判断是否是浏览器发出的请求
        const ua = req.get("user-agent");
        if (ua === "Profile/1.0") {
            res.sendStatus(200);
            return;
        }
        logger.info(">ready isign ipa ", req.path, "ua: ", ua);
        let udid = req.query.udid;
        let pid = req.query.pid;
        let act = req.query.act;
        let user = req.query.user;
        let img = `./platform/${pid}/img512.png`;
        let ipaDoc = await ipaFilesDao.getByPid(pid);
        let appleAcountData = await signActDao.getOneByAct(act);
        if (appleAcountData.code !== ErrCode.OK) {
            logger.error("进入下载，获取苹果账号失败");
            res.send(appleAcountData);
            return;
        }
        let relationData = await relationDao.getOneMonthOldAppleAccount(act, user, udid);
        if (relationData.code == ErrCode.OK && relationData.msg) {
            act = relationData.msg.appleAccount;
        }
        let ipaUrl = `itms-services:///?action=download-manifest&url=${globalCfg.ipaDomain}/platform/${pid}/${act}/manifest-${udid}.plist`;
        let ipaPath = path.join(process.cwd(), `./public/platform/${pid}/${act}/${udid}.ipa`);
        let ret = fs.existsSync(ipaPath);

        res.render("vipPackDl.ejs", {
            hasIpa: ret,
            udid: udid,
            account: act,
            pid: ipaDoc.msg.pid,
            img: img,
            ipaName: ipaDoc.msg.ipaName,
            score: ipaDoc.msg.score,
            ipaBrief: ipaDoc.msg.ipaBrief,
            ipaUrl: ipaUrl,
            user: user,
            size: (ipaDoc.msg.fileSize / 1024 / 1024).toFixed(2),
            appType: ipaDoc.msg.ipaType,
        });
    }

    isIpa = (req: Request, res: Response) => {
        logger.info("地址======》", req.url);
        let pid = req.query.pid;
        let act = req.query.act;
        let udid = req.query.udid;
        let ipaPath = path.join(process.cwd(), `./public/platform/${pid}/${act}/${udid}.ipa`);
        let ret = fs.existsSync(ipaPath);
        logger.info("updateIpa 请求 " + udid + ".ipa文件是否存在，目前状态为" + ret);
        res.send({ code: ErrCode.OK, msg: ret });
    }
    //下载次数更新
    addDlNumber = async (req: Request, res: Response) => {
        let data = req.body
        if (!data.user || !data.pid || !data.udid) {
            logger.error("addDlNumber err :", JSON.stringify(data))
            res.send({ code: ErrCode.OK, err: "请求数据缺失" })
            return
        }
        let appleAcountDate = await signActDao.getAccountList(data.user);
        let appleAccount = appleAcountDate.msg[0].act;
        /* 获取复用的老账号 */
        let relationData = await relationDao.getOneMonthOldAppleAccount(appleAcountDate.msg[0].act, data.user, data.udid);
        if (relationData.code == ErrCode.OK && relationData.msg) {
            appleAccount = relationData.msg.appleAccount;
        }
        if (appleAcountDate.code !== ErrCode.OK) {
            logger.info("下载次数,获取苹果账号失败");
            return appleAcountDate;
        }
        res.send({ code: ErrCode.OK });
        let relationModel = {
            user: data.user,
            udid: data.udid,
            pid: data.pid,
            downloadCount: 1,
            appleAccount: appleAccount,
        }
        let saveRet = await relationDao.insertOne(relationModel, 1);
        /* 更新应用设备安装数 */
        await ipaFilesDao.updateDevicesByPid(data.pid);
        // res.send(saveRet);
    }

}
export const newIpaApi = new NewIpaApi();