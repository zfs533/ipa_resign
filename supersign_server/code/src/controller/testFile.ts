import { Request, Response } from "express";
import * as path from "path";
import { ErrCode, CodeMsg, CodeMsgAny } from "../common/codeMsg";
import { logger } from "../common/logger";
import * as multiparty from "multiparty";
import * as fs from "fs";
import { createDir, removeDir, createPid, createBundleId } from "../common/utils";
import { shCmdHelper } from "../helper/shCmdHelper";
import { globalCfg } from "../models/globalCfgDao";
import { ipaFilesDao, IpaStatus } from "../models/ipaFileDao";
import { signActDao } from "../models/signActDao";
import { relationDao } from "../models/relationDao";
import { bindTask } from "../task/changeActTask";

class TestFile {
    uploadFlie = async (req: Request, res: Response) => {
        logger.info("ipaFileApi upload start");
        let pid = req.url.split("/")[3];

        if (!pid) {
            res.send({ code: ErrCode.BadRequest, err: "请先选择平台" });
            return;
        }
        let packageDir = path.join(process.cwd(), `./data/package/${pid}/`);
        if (!fs.existsSync(packageDir)) {
            createDir(packageDir);
        }
        // let depFiles = [
        //     "img512.png",
        //     "GAME-mobile.ipa",
        // ];
        // depFiles.forEach(depFile => {
        //     let srcFile = path.join(packageDir, depFile);
        //     if (fs.existsSync(srcFile)) {
        //         fs.unlinkSync(srcFile);
        //     }
        // });
        let form = new multiparty.Form({ encoding: "utf-8", autoFiles: true, uploadDir: path.join(process.cwd(), `./data/package/${pid}`) });
        let fileIdentifier = await new Promise<CodeMsg<string>>(resolve => {
            form.parse(req, async (err, fields, files) => {
                let chunkNumber = fields.chunkNumber[0];
                let identifier: string = fields.identifier[0];
                let uploadFileName: string = this.getChunkFilename(chunkNumber, identifier, pid);
                fs.renameSync(files.file[0].path, uploadFileName)
                let publicDir = path.join(process.cwd(), `./public/platform/${pid}/`);
                if (fs.existsSync(publicDir)) {
                    removeDir(publicDir);
                }
                logger.info("ipaFileApi upload finish");
                if (err) {
                    logger.warn("ipaFileApi upload fail", err);
                    resolve({ code: ErrCode.BadRequest, err: "文件上传失败" });
                    return;
                }
                let resIdentify = identifier + "&" + pid;
                resolve({ code: ErrCode.OK, msg: resIdentify });
            })
        })
        res.send(fileIdentifier.msg);
    }

    private cleanIdentifier = (identifier: string) => {
        return identifier.replace(/[^0-9A-Za-z_-]/g, '');
    }

    getChunkFilename(chunkNumber: number, identifier: string, pid: string) {
        let packageDir = path.join(process.cwd(), `./data/package/${pid}/`);
        // Clean up the identifier
        identifier = this.cleanIdentifier(identifier);
        // What would the file name be?
        return path.resolve(packageDir + identifier + '-' + chunkNumber);
    }

    buildUp = async (req: Request, res: Response) => {
        //req.params.identifier="1313155-comsdjhdfkl&GS"
        let ident = req.params.identifier;
        if (!ident) {
            res.send({ code: ErrCode.BadRequest, err: "请带上文件名称" });
            return;
        }

        let identifier = ident.split("&")[0];
        let pid = ident.split("&")[1];
        let fileSize = Number(identifier.split("-")[0]);
        let packageDir = path.join(process.cwd(), `./data/package/${pid}`);
        let realFile = fs.createWriteStream(path.join(packageDir, `Temp-GAME-mobile.ipa`));
        let ret = await this.buildUpFile(identifier, realFile, pid);
        if (ret.code !== ErrCode.OK) {
            res.send(ret);
            return;
        }
        /* 检查传包是否正确 */
        let isCorrect = await this.checkCorrectIpa(pid);
        if (!isCorrect.msg) {
            res.send({ code: ErrCode.upgradeErr, status: ErrCode.upgradeErr, err: "请上传与应用信息一致的应用" });
            return;
        }
        let updateRet = await ipaFilesDao.updateStatus(pid, IpaStatus.Opening, fileSize);
        res.send(updateRet);
    }

    private buildUpFile = (identifier: string, writeStream: fs.WriteStream, pid: string) => {
        return new Promise<CodeMsgAny>(resolve => {
            let file = async (chunkNumber: number) => {
                let chunkName = this.getChunkFilename(chunkNumber, identifier, pid);
                if (fs.existsSync(chunkName)) {
                    let readStream = fs.createReadStream(chunkName);
                    readStream.pipe(writeStream, { "end": false });
                    readStream.on("end", () => {
                        file(chunkNumber + 1);
                    });
                } else {
                    writeStream.end();
                    let cleanRet = await this.clearFile(identifier, pid);
                    resolve(cleanRet);
                }
            }
            file(1);
        })
    }

    private clearFile = (identifier: string, pid: string) => {
        return new Promise<CodeMsgAny>(resolve => {
            let rmFile = (chunkNumber: number) => {
                let chunkName = this.getChunkFilename(chunkNumber, identifier, pid);
                if (fs.existsSync(chunkName)) {
                    fs.unlinkSync(chunkName);
                    rmFile(chunkNumber + 1);
                } else {
                    resolve({ code: ErrCode.OK, msg: "合并完毕" });
                }
            }
            rmFile(1);
        })
    }

    /**
     * 判断上传的更新包是否正确
     * @param pid 应用唯一标识
     */
    private async checkCorrectIpa(pid: string): Promise<CodeMsgAny> {
        let tempIpaName = "Temp-GAME-mobile";
        let packageDir = path.join(process.cwd(), `./data/package/${pid}/`);
        let tempZipPath = path.join(packageDir, `${tempIpaName}.ipa`);
        if (!fs.existsSync(tempZipPath)) {
            logger.info("----------找不到保底---------");
            return Promise.resolve({ code: ErrCode.OK, msg: false });
        }
        let ipaDoc = await ipaFilesDao.getByPid(pid);
        if (ipaDoc.code !== ErrCode.OK) {
            return Promise.resolve({ code: ErrCode.OK, msg: false });
        }
        /* get app info version mianbundleId*/
        let info = await shCmdHelper.runCmd_GetApp(pid, tempIpaName);
        if (info.code !== ErrCode.OK) {
            logger.error("获取app info错误: ", JSON.stringify(info));
            return Promise.resolve({ code: ErrCode.OK, msg: false });
        }
        /* 是否为版本升级,pid mainBundleId */
        let isUpgrade = await ipaFilesDao.isUpgrade(ipaDoc.msg.act, info.msg.mainBid, pid);
        if (isUpgrade.msg.upgradeErr) {
            await shCmdHelper.runCmd_GetApp(pid, "GAME-mobile");
            fs.unlinkSync(tempZipPath)
            await ipaFilesDao.updateStatusNomal(pid, IpaStatus.Uploaded);
            /* 传错包了 */
            return Promise.resolve({ code: ErrCode.OK, msg: false });
        }
        /* 传对了 删包改名 */
        let packZipPath = path.join(packageDir, `GAME-mobile.ipa`);
        if (fs.existsSync(packZipPath)) {
            fs.unlinkSync(packZipPath);
        }
        await fs.renameSync(tempZipPath, packZipPath);
        return Promise.resolve({ code: ErrCode.OK, msg: true });
    }

    unzip = async (req: Request, res: Response) => {
        let pid = req.body.pid;
        if (!pid) {
            res.send({ code: ErrCode.BadRequest, err: "缺少应用id" });
            return;
        }

        let packageDir = path.join(process.cwd(), `./data/package/${pid}/`);
        let packZipPath = path.join(packageDir, `GAME-mobile.ipa`);
        if (!fs.existsSync(packZipPath)) {
            logger.info("找不到保底---------");
            res.send({ code: ErrCode.BadRequest, err: "找不到底包" });
            return;
        }

        let ipaDoc = await ipaFilesDao.getByPid(pid);
        if (ipaDoc.code !== ErrCode.OK) {
            return ipaDoc;
        }

        let iconImg = await shCmdHelper.runCmd_Create512Img(pid);
        if (iconImg.code !== ErrCode.OK) {
            res.send({ code: ErrCode.BadRequest, err: "解析icon出错===>" + JSON.stringify(iconImg) });
            return;
        }

        //get app info
        let info = await shCmdHelper.runCmd_GetApp(pid);
        if (info.code !== ErrCode.OK) {
            logger.error("获取app info错误: ", JSON.stringify(info));
            res.send(info);
            return;
        }

        /* 是否为版本升级,pid mainBundleId */
        let isUpgrade = await ipaFilesDao.isUpgrade(ipaDoc.msg.act, info.msg.mainBid, pid);
        /* 主bundleId是否重复,不能上传重复的包 */
        let existData = await ipaFilesDao.isExistmMainBundleId(ipaDoc.msg.act, info.msg.mainBid);
        if (existData.code == ErrCode.OK && existData.msg) {
            let existFile = await ipaFilesDao.isExistStatusEnabled(ipaDoc.msg.act, info.msg.mainBid);
            if (existFile.code == ErrCode.OK && existFile.msg && !isUpgrade.msg.upgrade) {
                /* 应用以存在于用户列表中且状态为3 Uploaded,且不是版本更新 */
                await this.deleteRepeatIpa(pid);
                res.send({ code: ErrCode.OK, msg: { status: IpaStatus.Deleted } });
                return;
            }
        }
        else if (existData.code !== ErrCode.OK) {
            logger.error("查找重复mainBundleId错误: ", JSON.stringify(existData));
            res.send(info);
            return;
        }
        /* 通过用户名获取当前苹果账号 */
        let appleAcountData = await signActDao.getAccountList(ipaDoc.msg.act);
        if (appleAcountData.code !== ErrCode.OK) {
            logger.error("解压应用，获取用户可用苹果账号列表失败");
            res.send(appleAcountData);
            return;
        }
        if (!appleAcountData.msg || appleAcountData.msg.length < 1) {
            logger.error(`${ipaDoc.msg.act}：没有绑定苹果账号`);
            res.send({ code: ErrCode.BadRequest, msg: `${ipaDoc.msg.act}：没有绑定苹果账号` });
            return;
        }
        /* 为用户当前账号创建应用bundleId */
        let analysis = await shCmdHelper.runCmd_CreateBundleId(appleAcountData.msg[0].act, appleAcountData.msg[0].pwd, info.msg.mainBid, info.msg.extentions);
        if (analysis.code !== ErrCode.OK) {
            logger.error("创建bundleId错误: ", JSON.stringify(analysis));
            /* 账号被被封，切换为带上传状态 */
            await ipaFilesDao.updateStatusNomal(pid, IpaStatus.NoUpload);
            res.send(analysis);
            return;
        }
        //解析从中获取iconBase64,target,bundleId,extentions扩展bundlid存到数据库
        let saveRet = await ipaFilesDao.target(pid, info.msg.target, info.msg.version, info.msg.mainBid, info.msg.extentions);
        if (saveRet.code !== ErrCode.OK) {
            res.send(saveRet);
            return;
        }
        logger.info("包分析完毕");
        res.send({ code: ErrCode.OK, msg: "文件解析完毕" });
        /* 在后台为应在用户所有账号下创建bundleId */
        await this.createBundleIdForAllUserAct(ipaDoc, appleAcountData, pid);
    }

    /**
     * 在后台为应在用户所有账号下创建bundleId
     * @param ipaDoc 
     * @param appleAcountData 
     * @param pid 
     */
    private async createBundleIdForAllUserAct(ipaDoc: any, appleAcountData: any, pid: string): Promise<CodeMsgAny> {
        let actList = await relationDao.getAllActByUser(ipaDoc.msg.act, appleAcountData.msg[0].act);
        if (actList.code !== ErrCode.OK) {
            logger.info(`关系表中查询用户账号列表失败${ipaDoc.msg.act}` + JSON.stringify(actList));
            return;
        }
        let list = actList.msg && actList.msg.length > 0 ? actList.msg[0].actList : [];
        if (appleAcountData.msg.length > 1) {
            for (let i = 1; i < appleAcountData.msg.length; i++) {
                let isHave = list.find((element: any) => { return element == appleAcountData.msg[i].act });
                if (!isHave)
                    list.push(appleAcountData.msg[i].act);
            }
        }
        await bindTask.backBatchCreateBundleid(list, pid);
    }

    /**
     * 上传包重复，删除
     * @param pid 应用pid
     */
    public async deleteRepeatIpa(pid: string) {
        let path1 = path.join(process.cwd(), `./data/package/${pid}/`);
        if (fs.existsSync(path1)) {
            removeDir(path1);
        }
        await ipaFilesDao.deleteIpaFileDb(pid);
    }
}

export const file = new TestFile();