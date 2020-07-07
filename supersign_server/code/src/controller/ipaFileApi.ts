import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { bindExpress, removeDir, createPid } from "../common/utils";
import { ErrCode } from "../common/codeMsg";
import { logger } from "../common/logger";
import { getIpaListMap, addIpaFileMap, deleteIpaFileMap, updateIpaFile, enableIpaFileMap, isCheckIpaFileMap, getOriBundlesMap } from "../common/requestSchemaMap";
import { ipaFilesDao, IpaFileModel, IpaStatus } from "../models/ipaFileDao";
import { globalCfg } from "../models/globalCfgDao";
import { JwtTokenUtil } from "../common/jwtTokenUtil";
import { adminUserDao } from "../models/adminDao";
import { shCmdHelper } from "../helper/shCmdHelper";


class IpaFileApi {
    get = async (req: Request, res: Response) => {
        let result = bindExpress(req, getIpaListMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: result.error });
            return;
        }
        let token = req.header("Authorization");
        let userMark = JwtTokenUtil.getNameFromToken(token);
        if (!userMark || userMark === undefined || userMark === "undefined") {
            res.send({ code: ErrCode.InvalidToken, err: "非法请求" });
            return;
        }
        let adminDoc = await adminUserDao.getByLoginName(userMark);

        let ret = await Promise.all([
            ipaFilesDao.getList(adminDoc.msg, result.value.ipaName, result.value.page, result.value.count, result.value.userName),
            ipaFilesDao.getListCount(adminDoc.msg, result.value.userName),
        ])
        let eIndex = ret.findIndex(e => e.code !== ErrCode.OK);
        if (eIndex >= 0) {
            logger.error("deleteActivity notify err:", JSON.stringify(ret[eIndex]));
            res.send(ret[eIndex]);
        }
        let resData: IpaFileModel[] = ret[0].msg.map(e => {
            let iconPath = path.join(process.cwd(), `./data/package/${e.pid}/img512.png`)
            if (fs.existsSync(iconPath)) {
                let iconBuffer = fs.readFileSync(iconPath).toString("base64");
                e.base64 = iconBuffer;
            } else {
                e.base64 = "";
            }
            return e
        })
        res.send({ code: ErrCode.OK, msg: { data: resData, total: ret[1].msg } });
    }

    add = async (req: Request, res: Response) => {
        let result = bindExpress(req, addIpaFileMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: result.error });
            return;
        }

        let token = req.header("Authorization");
        let userMark = JwtTokenUtil.getNameFromToken(token);
        if (!userMark || userMark === undefined || userMark === "undefined") {
            res.send({ code: ErrCode.InvalidToken, err: "非法请求" });
            return;
        }
        //生成随机不重复pid
        let pid = await createPid();
        if (pid.code !== ErrCode.OK) {
            res.send(pid);
            return;
        }
        let cond = result.value as IpaFileModel;
        cond.pid = pid.msg;
        cond.act = userMark;
        cond.score = 64887;
        cond.status = IpaStatus.NoUpload;
        cond.ipaUrl = `${globalCfg.ipaDomain}/sign?pid=${pid.msg}`;
        let countDoc = await ipaFilesDao.getCountByName(cond.ipaName, cond.act);
        if (countDoc.code !== ErrCode.OK) {
            res.send(countDoc);
            return;
        }
        if (countDoc.msg) {
            res.send({ code: ErrCode.BadRequest, err: "请不要频繁添加同一应用" });
            return;
        }
        let addIpa = await ipaFilesDao.saveIpaMsg(cond);

        res.send(addIpa);
    }

    update = async (req: Request, res: Response) => {
        let result = bindExpress(req, updateIpaFile);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: result.error });
            return;
        }
        let cond = result.value as IpaFileModel;
        let addIpa = await ipaFilesDao.updateIpaMsg(cond);
        res.send(addIpa);
    }

    delete = async (req: Request, res: Response) => {
        let result = bindExpress(req, deleteIpaFileMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: result.error });
            return;
        }
        let pid = result.value.pid;
        if (!pid) {
            res.send({ code: ErrCode.BadRequest, err: "请先选择平台" });
            return;
        }

        let path1 = path.join(process.cwd(), `./data/package/${pid}/`);
        let path2 = path.join(process.cwd(), `./public/platform/${pid}/`);
        let paths = [path1, path2];
        for (const path of paths) {
            if (fs.existsSync(path)) {
                removeDir(path);
            }
        }

        // let deleteRet = await ipaFilesDao.deleteIpaFile(result.value._id);
        let deleteRet = await ipaFilesDao.deleteIpaFile(pid);
        if (deleteRet.code !== ErrCode.OK) {
            res.send(deleteRet);
        }
        res.send({ code: ErrCode.OK });
    }

    enableIpa = async (req: Request, res: Response) => {
        let result = bindExpress(req, enableIpaFileMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: result.error });
            return;
        }
        let doc = await ipaFilesDao.getById(result.value._id);
        let packageDir = path.join(process.cwd(), `./data/package/${doc.msg.pid}/GAME-mobile.ipa`);
        if (!fs.existsSync(packageDir)) {
            res.send({ code: ErrCode.NotFound, err: "请先上传底包文件再尝试开启应用" });
            return;
        }
        let enableRet = await ipaFilesDao.enableIpaFile(result.value._id, result.value.enable);
        res.send(enableRet);
    }

    //打开用户验证
    checkIpa = async (req: Request, res: Response) => {
        let result = bindExpress(req, isCheckIpaFileMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: result.error });
            return;
        }
        let enableRet = await ipaFilesDao.checkIpaFile(result.value.pid, result.value.isCheck);
        res.send(enableRet);
    }

    //获取用户pids
    getOriBundles = async (req: Request, res: Response) => {
        let result = bindExpress(req, getOriBundlesMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: result.error });
            return;
        }
        let ret = await ipaFilesDao.getPidsByAct(result.value.userName);
        res.send(ret);
    }

    getUser = async (req: Request, res: Response) => {
        let ret = await ipaFilesDao.getUsers();
        res.send(ret);
    }

    getbundle = async (req: Request, res: Response) => {
        let ipas = await ipaFilesDao.getALl();
        let pids = ipas.msg.filter(e => !e.oriBundle);
        for (let i = 0; i < pids.length; i++) {
            const pidDoc = pids[i];
            let bundleId = await shCmdHelper.runCmd_GetApp(pidDoc.pid);
            if (bundleId.code !== ErrCode.OK) {
                logger.error("获取bundleId错误: ", JSON.stringify(bundleId));
                res.send(bundleId);
                return;
            }
            let updateRet = await ipaFilesDao.updateOribundle(pidDoc.pid, bundleId.msg.mainBid);
            if (updateRet.code !== ErrCode.OK) {
                res.send(updateRet);
                return;
            }
            logger.info(`=======================已获取第${i + 1}个应用原始bundleId，应用编号为${pidDoc.pid}======================`)
        }
        logger.info("原始bundleid补充完毕！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！");
        res.send({ code: ErrCode.OK })
    }

}
export const ipaFileApi = new IpaFileApi();