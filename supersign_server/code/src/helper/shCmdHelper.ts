
import { logger } from "../common/logger";
import * as fs from "fs";
import * as path from 'path';
import { createDir, replaceAll, removeDir, getChangeDate, createBundleId } from "../common/utils";
import { globalCfg } from "../models/globalCfgDao";
import * as readline from 'readline';
import { ErrCode, CodeMsg, CodeMsgAny, PrintErrMessage } from "../common/codeMsg";
import { signActDao, SignActModel, AccountStatus } from "../models/signActDao";
import { bindTask } from "../task/changeActTask";
import { ipaFilesDao, IpaFileModel } from "../models/ipaFileDao";
import { relationDao } from "../models/relationDao";
import { accountApi } from "../controller/accountApi";

class ShCmdHelper {
    private shCmdOrder = {
        createBundleId: 1,//创建bundleId
        createProfile: 2,//注册设备，创建描述文件
        resign: 3,//签名
        getTargetsAndVersion: 4,//获取app中target数量以及版本号
    }

    private shCmdErrCode = {
        diviceFull: 4,//当前使用的账号下设备数已满
        notFindBunldId: 5,//bundleId未找到
    }

    /**
     * 添加苹果账号
     * @param act 账号
     * @param pwd 密码
     * @param user 用户
     */
    public runCmd_AddAccount = async (act: string, pwd: string, user: string) => {
        let accountDir = path.join(process.cwd(), `./data/account/${act}`);
        if (!fs.existsSync(accountDir)) {
            createDir(accountDir);
        }
        let yzgPath = path.join(process.cwd(), `data/code/`);
        if (!fs.existsSync(yzgPath)) {
            createDir(yzgPath);
        }
        // #执行p12文件生成脚本
        let createP12Path = path.join(process.cwd(), `./shell/creat_cert.rb`);
        let yanzhengPath = path.join(process.cwd(), `data/code/${user}.txt`);
        let cmd = `${createP12Path} ${act} ${pwd} ${accountDir} ${yanzhengPath}`;
        let p12 = await this.runCmd("ruby", cmd);
        if (p12.code !== ErrCode.OK) {
            logger.error(p12)
        }
        return p12;
    }

    public runCmd_InitMobileConfig = async (pid: number, newDoman: string, ipaName: string, userId?: string) => {
        let cretPath = path.join(process.cwd(), "./data/cret")
        let templatePath = path.join(process.cwd(), "./data/template/mobileconfig.template")
        let iconPath = path.join(process.cwd(), `./data/package/${pid}/img512.png`)

        if (!fs.existsSync(templatePath)) {
            return { code: ErrCode.SysError, err: "找不到模版文件" + templatePath };
        }

        let publicDir = path.join(process.cwd(), `./public/platform/${pid}/`);
        if (!fs.existsSync(publicDir)) {
            createDir(publicDir)
        }
        let unsignedPath = path.join(publicDir, `unsigned.mobileconfig`)
        let signedPath = path.join(publicDir, `signed.mobileconfig`)
        let userPath = path.join(publicDir, `${userId}.mobileconfig`)
        if (fs.existsSync(iconPath)) {
            fs.copyFileSync(iconPath, path.join(publicDir, "img512.png"));
        } else {
            setTimeout(() => { fs.copyFileSync(iconPath, path.join(publicDir, "img512.png")) }, 1000)
        }
        let url = `${newDoman}/sign/getUdidIpa/${pid}`;
        if (userId) {
            url = `${newDoman}/sign/getUdidIpa/${pid}?id=${userId}`;
        }
        let templateContent = fs.readFileSync(templatePath).toString();
        if (templateContent) {
            templateContent = replaceAll("{URL}", url, templateContent);
            templateContent = replaceAll("{NAME}", ipaName, templateContent);
        }
        fs.writeFileSync(unsignedPath, templateContent);

        let cmd = `smime -sign -in ${unsignedPath} -out ${signedPath} -signer ${cretPath}/server.crt -inkey ${cretPath}/server.key -certfile ${cretPath}/ca.crt -outform der -nodetach`;
        if (userId) {
            cmd = `smime -sign -in ${unsignedPath} -out ${userPath} -signer ${cretPath}/server.crt -inkey ${cretPath}/server.key -certfile ${cretPath}/ca.crt -outform der -nodetach`;
        }
        return await this.runCmd("openssl", cmd);
    }

    public runCmd_Create512Img = async (pid: string) => {
        let ipaPath = path.join(process.cwd(), `./data/package/${pid}/GAME-mobile.ipa`)
        let iconPath = path.join(process.cwd(), `./data/package/${pid}/img512.png`)
        let PYPath = path.join(process.cwd(), "./shell/extractIcon.py")
        if (!fs.existsSync(ipaPath)) {
            return { code: ErrCode.SysError, err: "找不到ipa文件" + ipaPath };
        }
        let cmd = `${PYPath} ${ipaPath} ${iconPath}`;
        return await this.runCmd("python", cmd);
    }

    /**
     * 获取账号添加时间
     * @param appleAccount 苹果账号
     */
    public async runCmd_GetAppleAccount_AddTime(appleAccount: string, isBack?: boolean): Promise<CodeMsgAny> {
        let pyPath = path.join(process.cwd(), "shell/findAccounttAddTime.py");
        let timeFilePath = path.join(process.cwd(), "data/account/actAddTime.txt");
        let cmd = `${pyPath} ${timeFilePath}`;
        let codeDate = await this.runCmd("python3", cmd);
        if (codeDate.code != ErrCode.OK) {
            return codeDate;
        }
        let data = fs.readFileSync(timeFilePath, "utf-8");
        let list = JSON.parse(data);
        let addTime = accountApi.getActAddTime(list, appleAccount);
        if (isBack) {
            return Promise.resolve({ code: ErrCode.OK, msg: list });
        }
        return Promise.resolve({ code: ErrCode.OK, msg: addTime });
    }

    /**
     * 新 上传包创建bundleId
     * @param appleAccount 苹果账号 
     * @param password 苹果账号密码
     * @param mainBind 应用主bundleId
     * @param extentions 插件扩展名
     */
    public async runCmd_CreateBundleId(appleAccount: string, password: string, mainBind: string, extentions: any[]): Promise<CodeMsgAny> {
        let rubyPath = path.join(process.cwd(), "shell/create_bundleId.rb");
        let randBund = createBundleId(appleAccount);
        let cmd = `${rubyPath} ${appleAccount} ${password} `
        let main = "-findhead-" + mainBind + randBund + " ";
        cmd += main;
        for (let i = 0; i < extentions.length; i++) {
            cmd += mainBind + randBund + "." + extentions[i] + " ";
        }
        logger.info("start createBundleId:", cmd);
        let code = await this.runCmd("ruby", cmd);
        // 账号被封时切换账号
        if (code.code === ErrCode.AppleError) {
            logger.info("------上传包创建bundleId账号被封------");
            await signActDao.updateBlocked(appleAccount);
            bindTask.expireIpas();
        }
        return code
    }

    /* 旧 传包创建bundleId */
    public runCmd_Analysis_CreatBundleId = async (appleAccount: string, pidbidArr: Array<any>, passworld: string) => {
        let pyPath = path.join(process.cwd(), "shell/Analysis.py");
        let ipaName = "GAME-mobile";
        let ipaPath = path.join(process.cwd(), `./data/package/`);
        let act = appleAccount;
        let pwd = passworld;
        let shellPath = path.join(process.cwd(), "shell");
        let order = this.shCmdOrder.createBundleId;
        //python脚本路径，包名，包路径，账号，密码，shell文件夹路径
        let cmd = `${pyPath} ${order} ${ipaName} ${ipaPath} ${act} ${pwd} ${shellPath}`;
        for (let i = 0; i < pidbidArr.length; i++) {
            let ppid = pidbidArr[i][0];
            let bundleRand = pidbidArr[i][1];
            cmd += " " + ppid + " " + bundleRand
        }
        logger.info("start analysis:", cmd);
        let code = await this.runCmd("python3", cmd);

        // 账号被封时切换账号
        if (code.code === ErrCode.AppleError) {
            logger.info("------上传包创建bundleId账号被封------");
            await signActDao.updateBlocked(appleAccount);
            bindTask.expireIpas();
        }
        return code
    }

    /**
     * 新 切换账号创建bundleId 
     * @param actDoc 新账号
     * @param oldAppleAccount 老账号
     * @param ipaArr 应用列表
     */
    public async runCmd_Change_BundleId(actDoc: SignActModel, oldAppleAccount: string, ipaArr: any[]): Promise<CodeMsgAny> {
        let rubyPath = path.join(process.cwd(), "shell/create_bundleId.rb");
        let randBund = createBundleId(actDoc.act);
        let cmd = `${rubyPath} ${actDoc.act} ${actDoc.pwd} `
        let bindArr: any[] = [];//兼容之前没有保存插件的多target包
        for (let i = 0; i < ipaArr.length; i++) {
            let item: IpaFileModel = ipaArr[i];
            if (item.target > 0) {
                /* 兼容没有保存扩展包插件bundleid的应用 */
                if (item.extentions && item.extentions.length > 0) {
                    cmd += "-findhead-" + item.oriBundle + randBund + " ";
                    for (let j = 0; j < item.extentions.length; j++) {
                        cmd += item.oriBundle + randBund + "." + item.extentions[j] + " ";
                    }
                }
                else {
                    bindArr.push([item.pid, randBund]);
                }
            }
            else {
                cmd += "-findhead-" + item.oriBundle + randBund + " ";
            }
        }
        let code = await this.runCmd("ruby", cmd);
        // 账号被封时切换账号
        if (code.code === ErrCode.AppleError) {
            await signActDao.updateBlocked(actDoc.act);
            if (oldAppleAccount) {
                await bindTask.changeStatus(oldAppleAccount, AccountStatus.Normal, null);
            }
            bindTask.expireIpas();
            return code;
        }
        else if (code.code != ErrCode.OK) {
            await bindTask.changeStatus(oldAppleAccount, AccountStatus.Normal, null);
            await signActDao.updateNewActStatus(actDoc.act, 0);
        }
        if (bindArr.length > 0) {
            if (oldAppleAccount) {
                code = await this.runCmd_Analysis_UpdateBundleId(actDoc, bindArr, oldAppleAccount);
            }
        }
        return code
    }

    /* 旧 切换账号创建bundleId */
    public runCmd_Analysis_UpdateBundleId = async (actDoc: SignActModel, pidbidArr: Array<any>, oldAppleAccount: string) => {
        let pyPath = path.join(process.cwd(), "shell/Analysis.py");
        let ipaName = "GAME-mobile";
        let ipaPath = path.join(process.cwd(), `./data/package/`);
        let act = actDoc.act;
        let pwd = actDoc.pwd;
        let shellPath = path.join(process.cwd(), "shell");
        let order = this.shCmdOrder.createBundleId;
        //python脚本路径，包名，包路径，账号，密码，shell文件夹路径
        let cmd = `${pyPath} ${order} ${ipaName} ${ipaPath} ${act} ${pwd} ${shellPath}`;
        for (let i = 0; i < pidbidArr.length; i++) {
            let ppid = pidbidArr[i][0];
            let bundleRand = pidbidArr[i][1];
            cmd += " " + ppid + " " + bundleRand
        }
        logger.info("start analysis:", cmd);
        let code = await this.runCmd("python3", cmd);

        // 账号被封时切换账号
        if (code.code === ErrCode.AppleError) {
            logger.info("------旧 切换账号创建bundleId账号被封------");
            await signActDao.updateBlocked(actDoc.act);
            await bindTask.changeStatus(oldAppleAccount, AccountStatus.Normal, null);
            bindTask.expireIpas();
        }
        return code
    }

    /**
     * 删除签名账号的同时，将其对应在钥匙串中的证书也一并删除
     * @param p12path p12 文件的路径
     */
    public runCmd_Delete_Certificate = async (p12path: string) => {
        let pyPath = path.join(process.cwd(), "shell/deleteCertificate.py");
        let cmd = `${pyPath} ${p12path}`
        logger.info("delete certificate: ", cmd)
        return await this.runCmd("python", cmd);
    }

    /**
     * 签出来的包，10分钟后删除
     * @param ipaPath 
     */
    public clearIpaByTime(ipaPath: string) {
        setTimeout((ipaPath) => {
            if (fs.existsSync(ipaPath)) {
                fs.unlinkSync(ipaPath);
            }
        }, 1000 * 60 * 10, ipaPath);
    }

    /**
     * 执行签名脚本
     * @param pid 应用唯一标示
     * @param act 苹果账号
     * @param udid 设备号
     * @param name 最好的娱乐平台
     * @param bundleId 应用bundleId（苹果账号md5加密，16位）
     */
    public async runCmd_Isign(pid: string, act: string, udid: string, name: string, bundleId: string): Promise<CodeMsgAny> {
        let outSignedDir = path.join(process.cwd(), `./public/platform/${pid}/${act}/`);
        if (!fs.existsSync(outSignedDir)) {
            createDir(outSignedDir);
        }
        let packageDir = path.join(process.cwd(), `./data/package/${pid}/`);
        let pyPath = path.join(process.cwd(), "shell/Analysis.py");
        let ipaPath = path.join(process.cwd(), `./data/package/`);
        let shellPath = path.join(process.cwd(), "shell");
        let p12Path = path.join(process.cwd(), `./data/account/${act}/`);
        let inIpaPath = path.join(packageDir, `GAME-mobile.ipa`);
        let outSignedPath = path.join(outSignedDir, `${udid}.ipa`);
        let order = this.shCmdOrder.resign;
        let cmd = `${pyPath} ${order} ${ipaPath} ${shellPath} ${bundleId} ${p12Path} ${inIpaPath} ${outSignedPath} ${udid} ${pid}`;
        logger.info(cmd)
        let ret = await this.runCmd("python3", cmd);

        if (ret.code !== ErrCode.OK) {
            return ret
        }
        /* 删除签名包 */
        this.clearIpaByTime(outSignedPath);
        logger.info("签名结果========>", ret.msg)
        logger.info("shCmdHelper runCmd_Isign isign ok")
        // 签名成功
        let depFiles = [
            "img512.png",
        ];
        depFiles.forEach(depFile => {
            let srcFile = path.join(packageDir, depFile);
            let distFile = path.join(outSignedDir, depFile);
            // logger.info("shCmdHelper runCmd_Isign copy dep file", srcFile, distFile)
            fs.copyFileSync(srcFile, distFile);
        });
        let rootUrl = `${globalCfg.ipaDomain}/platform/${pid}/${act}/`;
        let templatePath = path.join(process.cwd(), "./data/template/manifest.plist.template")
        let templateContent = fs.readFileSync(templatePath).toString();
        if (templateContent) {
            templateContent = replaceAll("{ROOT_URL}", rootUrl, templateContent);
            templateContent = replaceAll("{NAME}", name, templateContent);
            templateContent = replaceAll("{UDID}", udid, templateContent)
        }
        let distManifestFile = path.join(outSignedDir, `manifest-${udid}.plist`);
        fs.writeFileSync(distManifestFile, templateContent);
        return ret;
    }
    /**
     * 新 运行外部命令来注册设备ID及创建描述文件
     * @param udid 设备的udid
     * @param act 账号  
     * @param pwd 密码
     * @param bundleId 应用的BUndleID，创建描述文件时用 
     * @param pid 应用的PID
     * @param user 账号对应的用户名
     */
    public async runCmd_RegisterDeviecNew(udid: string, act: string, pwd: string, bundleId: string, pid: any, user: string): Promise<CodeMsgAny> {
        let ipaFile = await ipaFilesDao.getByPid(pid);
        if (ipaFile.code !== ErrCode.OK) {
            logger.error(`创建描述文件过程中，查找应用失败：${pid}`);
            return ipaFile;
        }
        let rbPath = path.join(process.cwd(), "shell/registerDeviceID.rb");
        let uname = "iphonemax";
        let filePath = path.join(process.cwd(), `./data/account/${act}/`);
        let mainBundleId = ipaFile.msg.oriBundle + createBundleId(act);
        let cmd = `${rbPath} ${act} ${pwd} ${uname} ${udid} ${mainBundleId} ${filePath}`
        if (ipaFile.msg.target > 0) {
            let list = ipaFile.msg.extentions;
            if (list && list.length > 0) {
                logger.info("有list：" + list);
                for (let i = 0; i < list.length; i++) {
                    cmd += ` ${list[i]}`
                }
            }
            else {/* 兼容以前没有保存扩展包的多target应用 */
                return await this.runCmd_RegisterDevice(udid, act, pwd, bundleId, pid, user);
            }
        }
        let retData = await this.runCmd("ruby", cmd);

        let str = retData.msg.join()
        let deviceCount = +str.match(/(?<=startChange).*?(?=endChange)/)[0]
        let update = await signActDao.updateDeviceCount(act, deviceCount);
        if (update.code !== ErrCode.OK) {
            logger.info("刷新账号下设备数失败");
            return update;
        }
        // 账号被封，切换账号
        if (retData.code !== ErrCode.OK) {
            if (retData.code === ErrCode.AppleError) {
                await signActDao.updateBlocked(act);
                bindTask.expireIpas();
                return retData
            }
            else if (retData.code === ErrCode.MaxUdid) {
                /* 账号下udid大于等于100 切换账号  */
                await bindTask.changeAccount(user);
                await relationDao.updateUdid(act, udid, udid + "22");
                let actDoc = await signActDao.getAccountList(user);
                return await this.runCmd_RegisterDeviecNew(udid, actDoc.msg[0].act, actDoc.msg[0].pwd, createBundleId(actDoc.msg[0].act), pid, user);
            }
        }

        /* 检查是否可以切换账号 */
        this.handleChangeTask(user, deviceCount);
        /* 新设备，刷新当前账号新设备数量 */
        let newUdid = str.match(/(?<=startUdid).*?(?=endUdid)/)
        if (newUdid && newUdid.length > 0) {
            /* 在relations关系表里记录一下,防止额外消耗次数，但不增加下载次数 */
            let relationModel = {
                user: user,
                udid: udid,
                pid: pid,
                downloadCount: 0,
                appleAccount: act,
            }
            await relationDao.insertOne(relationModel, 0);
            /* 更新应用设备安装数 */
            await ipaFilesDao.updateDevicesByPid(pid);
        }
        return retData;
    }

    public async handleChangeTask(user: string, deviceCount: number): Promise<CodeMsgAny> {
        let appleAcountData: any = await signActDao.getAccountList(user);
        let changingAct = await signActDao.getChangingAccount(user);
        if (changingAct.code !== ErrCode.OK) {
            logger.error(`获取用户${user}正在切换中的账号出错啦！`);
            return;
        }
        /* 设备数已经达到预警值 */
        if (appleAcountData.msg.length < 2 && !changingAct.msg) {
            bindTask.expireIpas();
        }
        if (deviceCount >= 100) {
            /* 切换账号  */
            await bindTask.changeAccount(user);
        }
        return null;
    }

    /**
     * 运行外部命令来注册设备ID及创建描述文件
     * @param udid 设备的udid
     * @param act 账号  
     * @param pwd 密码
     * @param bundleId 应用的BUndleID，创建描述文件时用 
     * @param pid 应用的PID
     * @param user 账号对应的用户名
     */
    public async runCmd_RegisterDevice(udid: string, act: string, pwd: string, bundleId: string, pid: any, user: string): Promise<CodeMsg<string[]>> {
        let pyPath = path.join(process.cwd(), "shell/Analysis.py");
        let ipaName = "GAME-mobile";
        let ipaPath = path.join(process.cwd(), `./data/package/`);
        let shellPath = path.join(process.cwd(), "shell");
        let filePath = path.join(process.cwd(), `./data/account/${act}/`);
        let order = this.shCmdOrder.createProfile;
        let i = "iphone";
        let cmd = `${pyPath} ${order} ${ipaName} ${ipaPath} ${act} ${pwd} ${shellPath} ${filePath} ${bundleId} ${i} ${udid} ${pid}`;
        let retData = await this.runCmd("python3", cmd);

        let str = retData.msg.join()
        let deviceCount = +str.match(/(?<=startChange).*?(?=endChange)/)[0]
        let update = await signActDao.updateDeviceCount(act, deviceCount);
        if (update.code !== ErrCode.OK) {
            logger.info("刷新账号下设备数失败");
            return update;
        }
        // 账号被封，切换账号
        if (retData.code !== ErrCode.OK) {
            if (retData.code === ErrCode.AppleError) {
                await signActDao.updateBlocked(act);
                bindTask.expireIpas();
                return retData;
            }
            else if (retData.code === ErrCode.MaxUdid) {
                /* 账号下udid大于等于100 切换账号  */
                await bindTask.changeAccount(user);
                await relationDao.updateUdid(act, udid, udid + "22");
                let actDoc = await signActDao.getAccountList(user);
                return await this.runCmd_RegisterDevice(udid, actDoc.msg[0].act, actDoc.msg[0].pwd, createBundleId(actDoc.msg[0].act), pid, user);
            }
        }

        /* 检查是否可以切换账号 */
        this.handleChangeTask(user, deviceCount);
        /* 新设备，刷新当前账号新设备数量 */
        let newUdid = str.match(/(?<=startUdid).*?(?=endUdid)/)
        if (newUdid && newUdid.length > 0) {
            /* 在relations关系表里记录一下,防止额外消耗次数，但不增加下载次数 */
            let relationModel = {
                user: user,
                udid: udid,
                pid: pid,
                downloadCount: 0,
                appleAccount: act,
            }
            await relationDao.insertOne(relationModel, 0);
            /* 更新应用设备安装数 */
            await ipaFilesDao.updateDevicesByPid(pid);
        }
        return retData;
    }


    /**
     * 运行外部命令的底层方法
     * @param bin 要使用的程序
     * @param cmd 参数
     * @returns 返回一个带有运行输出和错误码的 Promise<CodeMsg<string[]>>
     */
    runCmd = (bin: string, cmd: string): Promise<CodeMsg<string[]>> => {
        console.log("runCmd >> ", bin, cmd)
        return new Promise<CodeMsg<string[]>>(resolve => {
            let spawn = require('child_process').spawn;
            let params = cmd.split(" ")
            params = params.filter(param => param != "")
            let outProcess = spawn(bin, params, { encoding: 'utf8' });
            let retData: string[] = [];

            let rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            outProcess.stdout.on('data', function (data: any) {
                let str = data.toString();
                if (str && str !== "\n") {
                    retData.push(str)
                    logger.info("ondata pid:%d : ", outProcess.pid, data.toString());
                }
            });

            outProcess.on('error', function (error: any) {
                logger.error("on error pid:%d error: %s", outProcess.pid, error);
            });
            outProcess.on('uncaughtException', function (error: any) {
                logger.error(" pid:%s uncaughtException:\n%@", outProcess.pid, error);
            });

            outProcess.stderr.on('data', function (data: any) {
                logger.info("onerr data", data.toString());
                let str = data.toString();
                if (str && str !== "\n") {
                    retData.push(str)
                }
            });

            outProcess.on('exit', function (code: any) {
                logger.info("运行脚本返回：", code);
                if (rl) { rl.close(); }
                if (code != 0) {
                    logger.error("on exit pid:%d error code: ", outProcess.pid, code);
                    logger.error("Error Message : %s", PrintErrMessage(code))
                    resolve({ code: code, msg: retData, err: code });
                } else {
                    logger.info("on exit pid:%d ", outProcess.pid);
                    resolve({ code: ErrCode.OK, msg: retData, err: code });
                }

                outProcess.kill('SIGINT');
                outProcess = null;
            });

            rl.on('line', function (line) {
                if (outProcess) { outProcess.stdin.write(line + "\n"); }
            });
        });
    }

    /**
     * 运行外部命令获取ipa信息，包括主bundleID、target数量、版本号,插件数
     * @param pid 应用的pid
     * @param pgName 包底名
     * @returns 错误码及ipa信息
     */
    public async runCmd_GetApp(pid: string, pgName?: string): Promise<CodeMsgAny> {
        let pyPath = path.join(process.cwd(), "shell/Analysis.py");
        let packageDir = path.join(process.cwd(), `./data/package/`);
        let ipaName = pgName ? pgName : "GAME-mobile";
        let order = this.shCmdOrder.getTargetsAndVersion;
        let cmd = `${pyPath} ${order} ${ipaName} ${packageDir} ${pid}`
        let retData = await this.runCmd("python3", cmd);

        let strArr = retData.msg;
        let ipaInfoStr = '{' + strArr.pop().match("([^{]*?)(?=\})") + '}'
        let ipaInfo = JSON.parse(ipaInfoStr);
        ipaInfo.extentions = ipaInfo.extentions.split(",");
        if (ipaInfo.extentions.length == 1 && ipaInfo.extentions[0] == "") {
            ipaInfo.extentions = [];
        }
        return { code: retData.code, msg: ipaInfo };
    }
    /**
     * 临时处理关系表老账号复用
     * @param actDoc 
     * @param ipaArr 
     */
    public async runCmd_tempCreate_BundleId(actDoc: SignActModel, ipaArr: any[]): Promise<CodeMsgAny> {
        let rubyPath = path.join(process.cwd(), "shell/create_bundleId.rb");
        let randBund = createBundleId(actDoc.act);
        let cmd = `${rubyPath} ${actDoc.act} ${actDoc.pwd} `
        let bindArr: any[] = [];//兼容之前没有保存插件的多target包
        for (let i = 0; i < ipaArr.length; i++) {
            let item: IpaFileModel = ipaArr[i];
            if (item.target > 0) {
                /* 兼容没有保存扩展包插件bundleid的应用 */
                if (item.extentions && item.extentions.length > 0) {
                    cmd += "-findhead-" + item.oriBundle + randBund + " ";
                    for (let j = 0; j < item.extentions.length; j++) {
                        cmd += item.oriBundle + randBund + "." + item.extentions[j] + " ";
                    }
                }
                else {
                    bindArr.push([item.pid, randBund]);
                }
            }
            else {
                cmd += "-findhead-" + item.oriBundle + randBund + " ";
            }
        }
        let code = await this.runCmd("ruby", cmd);
        // 账号被封时切换账号
        if (code.code === ErrCode.AppleError) {
            logger.info(`1234567890账号被封 ${actDoc.act}`)
            await signActDao.updateBlocked(actDoc.act);
            return code;
        }
        else if (code.code != ErrCode.OK) {
            logger.info(`1234567890创建失败 ${actDoc.act}`)
        }
        if (bindArr.length > 0) {
            code = await this.runCmd_temp_UpdateBundleId(actDoc, bindArr);
        }
        return code
    }

    /**
    * 临时处理关系表老账号复用
    * @param actDoc 
    * @param pidbidArr 
    */
    public runCmd_temp_UpdateBundleId = async (actDoc: SignActModel, pidbidArr: Array<any>) => {
        let pyPath = path.join(process.cwd(), "shell/Analysis.py");
        let ipaName = "GAME-mobile";
        let ipaPath = path.join(process.cwd(), `./data/package/`);
        let act = actDoc.act;
        let pwd = actDoc.pwd;
        let shellPath = path.join(process.cwd(), "shell");
        let order = this.shCmdOrder.createBundleId;
        //python脚本路径，包名，包路径，账号，密码，shell文件夹路径
        let cmd = `${pyPath} ${order} ${ipaName} ${ipaPath} ${act} ${pwd} ${shellPath}`;
        for (let i = 0; i < pidbidArr.length; i++) {
            let ppid = pidbidArr[i][0];
            let bundleRand = pidbidArr[i][1];
            cmd += " " + ppid + " " + bundleRand
        }
        logger.info("start analysis:", cmd);
        let code = await this.runCmd("python3", cmd);

        // 账号被封时切换账号
        if (code.code === ErrCode.AppleError) {
            logger.info(`1234567890123账号被封 ${actDoc.act}`)
            await signActDao.updateBlocked(actDoc.act);
            bindTask.expireIpas();
        }
        return code
    }

    /**
     * 批量账号创建bundleId actIpaList{ act: currentAct, ipaList: selectArr }
     * @param actDoc 
     * @param ipaArr 
     */
    public async runCmd_temp1(actIpaList: any[]): Promise<CodeMsgAny> {
        let rubyPath = path.join(process.cwd(), "shell/batchCreateBundleId.rb");
        let commond = `${rubyPath} `
        for (let i = 0; i < actIpaList.length; i++) {
            let ipaArr = actIpaList[i].ipaList;
            let actData = await signActDao.getOneByAct(actIpaList[i].act.act);
            logger.info(i, actData.msg);
            if (!actData.msg) { continue; }
            let act = actData.msg.act;
            let randBund = createBundleId(act);
            let pwd = actData.msg.pwd;
            commond += `${act}-${pwd}-`
            for (let j = 0; j < ipaArr.length; j++) {
                let item: IpaFileModel = ipaArr[j];
                if (item.target > 0) {
                    /* 兼容没有保存扩展包插件bundleid的应用 */
                    if (item.extentions && item.extentions.length > 0) {
                        commond += "mianbid=" + item.oriBundle + randBund + "-";
                        for (let j = 0; j < item.extentions.length; j++) {
                            commond += item.oriBundle + randBund + "." + item.extentions[j] + "-";
                        }
                    }
                }
                else {
                    commond += "mianbid=" + item.oriBundle + randBund + "-";
                }
            }
            commond += " "
        }
        let code = await this.runCmd("ruby", commond);
        return code
    }
}

export const shCmdHelper = new ShCmdHelper();