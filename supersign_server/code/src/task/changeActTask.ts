import { ErrCode, CodeMsgAny } from "../common/codeMsg";
import { logger } from "../common/logger";
import { signActDao, SignActReq, SignActModel, AccountStatus } from "../models/signActDao";
import { ipaFilesDao } from "../models/ipaFileDao";
import { shCmdHelper } from "../helper/shCmdHelper";
import { Request, Response } from "express";
import { relationDao } from "../models/relationDao";
import { bindExpress } from "../common/utils";
import { gaveUserOneActMap } from "../common/requestSchemaMap";
import { statisticsDao } from "../models/statisticsDao";
import { SynchronizeData } from "../models/statisticsDao";
class BindActTask {
    /* 获取映射表结束后才能开始下一波 */
    private isRelationFinished: boolean = true;
    public expireIpas = () => {
        this.startActChangeTask();
    }
    /**
     * 开始切换账号任务
     */
    public async startActChangeTask() {
        logger.info(`----------------------------------------------------------------${this.isRelationFinished}`)
        if (!this.isRelationFinished) {
            return;
        }
        this.isRelationFinished = false;
        /* 获取全部满足切换条件的账号 */
        let actList = await this.getAllUsingAct();
        logger.info("actList", actList);
        if (actList.code != ErrCode.OK) {
            this.isRelationFinished = true;
            return;
        }
        /* 获取当前账号切换到新账号的映射表{currentAct:,newAct:} */
        let relationList = await this.getChangeActRelationList(actList.msg);
        this.isRelationFinished = true;
        if (relationList.msg.length < 1) { return; }
        /* 根据映射列表开始切换账号 */
        for (let i = 0; i < relationList.msg.length; i++) {
            await this.startChange(relationList.msg[i].newAct, relationList.msg[i].currentAct);
        }
    }
    /**
     * 获取全部满足切换条件的账号
     */
    public async getAllUsingAct(): Promise<CodeMsgAny> {
        let actList = await signActDao.getValidActs();
        if (actList.code !== ErrCode.OK) {
            logger.error("get users err:", actList.err);
            return Promise.resolve({ code: ErrCode.BadRequest, msg: actList.msg });
        }
        if (!actList.msg.length) {
            logger.info("当前没有满足切换条件的账号");
            return Promise.resolve({ code: ErrCode.BadRequest, msg: actList.msg });
        }
        return Promise.resolve({ code: ErrCode.OK, msg: actList.msg });
    }

    /**
     * 获取当前账号切换到新账号的映射表[{currentAct:,newAct:}]
     * @param actList 全部满足切换条件的账号
     */
    public async getChangeActRelationList(actList: any[]): Promise<CodeMsgAny> {
        return new Promise(async resolve => {
            let tempList = [];
            for (let i = 0; i < actList.length; i++) {
                let currentAct = actList[i];
                /* 获取一个可用账号 */
                let newAct = await signActDao.bindAct();
                if (newAct.code !== ErrCode.OK) {
                    logger.error("备用账号绑定异常:", JSON.stringify(newAct));
                    break;
                }
                if (!newAct.msg) {
                    logger.error("没有可用账号了");
                    break;
                }
                /* 将新账号设置为以被选，防止连个人选中同一个账号 */
                let setNewActStatus = await signActDao.updateNewActStatus(newAct.msg.act, 1);
                if (setNewActStatus.code !== ErrCode.OK) {
                    logger.error("更新选中账号状态失败：" + JSON.stringify(setNewActStatus));
                    continue;
                }
                /* 将当前账号设置为切换中状态 */
                let setCurrentActStatus = await this.changeStatus(currentAct.act, AccountStatus.Normal, AccountStatus.Changing);
                if (setCurrentActStatus.code !== ErrCode.OK) {
                    logger.error("更新当前账号为切换中状态失败：" + JSON.stringify(setCurrentActStatus));
                    continue;
                }
                tempList.push({ newAct: newAct.msg, currentAct: currentAct });
            }
            resolve({ code: ErrCode.OK, msg: tempList });
        });
    }

    /**
     * 开始切换
     * @param newAct 新账号
     * @param currentAct 当前账号
     */
    public async startChange(newAct: SignActModel, currentAct: SignActModel) {
        logger.info(`----------有账号切换${currentAct.act} to ${newAct.act}---------`)
        /* 获取用户所有应用 */
        let ipaList = await ipaFilesDao.getBindsByAct(currentAct.user);
        if (ipaList.code !== ErrCode.OK) {
            logger.error("获取bundleId异常:", JSON.stringify(ipaList));
            return;
        }
        logger.info(`ipaList.msg.length=${ipaList.msg.length} currentAct:${currentAct.act} newAct:${newAct.act} user:${currentAct.user}`);
        /* 用户没有应用直接跳过,并将当前账号和新账号状态还原 */
        if (!ipaList.msg || ipaList.msg.length < 1) {
            /* 状态还原 */
            await this.changeStatus(currentAct.act, AccountStatus.Normal, null);
            await signActDao.updateNewActStatus(newAct.act, 0);
            return;
        }
        /* 遍历应用列表，在新的账号下为应用创建bundleId */
        let tempArr: any[] = [];
        let selectArr: any[] = [];
        for (const ipa of ipaList.msg) {
            /* 暂时去重一下mainBundleId */
            let isHave = tempArr.find((element: string) => { return element == ipa.oriBundle; });
            if (isHave) {
                continue;
            } else {
                tempArr.push(ipa.oriBundle);
            }
            selectArr.push(ipa);
        }

        let analysis = await shCmdHelper.runCmd_Change_BundleId(newAct, currentAct.act, selectArr);
        if (analysis.code !== ErrCode.OK) {
            logger.error("添加新bundleId错误: ", JSON.stringify(analysis));
            return;
        }
        /* 新账号绑定给用户 */
        let udpateRet = await signActDao.updateBindAct(newAct.act, currentAct.user);
        if (udpateRet.code !== ErrCode.OK) {
            return;
        }
        /* todo切换账号，将预警账号状态设为null状态 */
        if (!currentAct.isBlocked) {
            await this.changeStatus(currentAct.act, AccountStatus.Normal, null);
        }
        else {
            /* 被封的直接设置为不可用状态，避免切换账号检测又找到它 */
            await this.changeStatus(currentAct.act, AccountStatus.Full, AccountStatus.Changed, true);
        }
    }

    /**
     * 
     * @param act 账号
     * @param status 状态（Normal，Full）
     * @param change 切换状态（null,Changing,Changed）
     * @param really 是否真正的切换，详情跳转到函数定义处查看
     */
    public async changeStatus(act: string, status: string, change: any, really?: boolean): Promise<CodeMsgAny> {
        let signActModel: SignActModel = {
            act: act, pwd: "", user: "",
            status: status, change: change,
        };
        let data = await signActDao.updateStatus(signActModel, really);
        if (really) {
            /* 更新数据统计今日账号销量 */
            let actDao = await signActDao.getCurrentDayDevices(data.msg.user);
            if (actDao.msg && actDao.msg.length > 0) {
                let count = actDao.msg[0].appleActCount;
                let day = actDao.msg[0].sumDate;
                let user = data.msg.user;
                await statisticsDao.insertOneOrUpdateDlCount(user, day, count, SynchronizeData.ActCount);
            }
        }
        return data;
    }

    /**
     * 账号设备数达到100了，切换备用
     * @param user 用户
     */
    public async changeAccount(user: string): Promise<CodeMsgAny> {
        /* 通过用户名获取当前苹果账号 */
        let actData: any = await signActDao.getAccountList(user);
        if (actData.code !== ErrCode.OK) {
            logger.error("切换账号，获取用户可用苹果账号列表失败");
            return null;
        }
        if (actData.msg.length < 2) {
            logger.warn("账号不足，无法切换");
            return null;
        }
        for (let i = 0; i < actData.msg.length; i++) {
            if (actData.msg[i].deviceCount >= 100) {
                await this.changeStatus(actData.msg[i].act, AccountStatus.Full, AccountStatus.Changed, true);
            }
        }
        this.expireIpas();
        return null;
    }

    /**
     * 手动触发切换账号任务
     * @memberof BindActTask
     */
    public handleChange = async (req: Request, res: Response) => {
        this.expireIpas();
        res.send({ code: ErrCode.OK });
    }
    /**
     * 手动触发数据同步
     * @memberof
     */
    public handleSynchronizeData = async (req: Request, res: Response) => {
        await statisticsDao.initData();
        res.send({ code: ErrCode.OK });
    }

    /**
     * 取出所有用户的udid
     */
    public async getAllUserAndUdids(): Promise<CodeMsgAny> {
        return new Promise(async resolve => {
            let data = await relationDao.getUdidsByUser();
            resolve({ code: ErrCode.OK, msg: data.msg });
        })
    }

    /**
     * 更新关系表设备id所使用的账号为其使用过的最新的账号
     * @param req 
     * @param res 
     */
    public async startReplace(req: Request, res: Response) {
        let allActAndAppList: any[] = [];
        /* 取出所有用户的udid */
        let data = await bindTask.getAllUserAndUdids();
        /* 取出设备最近使用的一个账号,并将之前使用过的账号批量替换成最近使用的这个账号 */
        let userUdids = data.msg;
        for (let i = 0; i < userUdids.length; i++) {
            let item = userUdids[i];
            for (let j = 0; j < item.udids.length; j++) {
                let one = await relationDao.getActUdid(item.user, item.udids[j])
                logger.info(i, j, one.msg[0]);
                await relationDao.updateMany(one.msg[0].user, one.msg[0].udid, one.msg[0].appleAccount);
            }
        }
        res.send({ code: ErrCode.OK });
        /* 获取用户所有账号 */
        let dataList = await relationDao.getUserActList();
        /* 开始遍历并创建bundleId */
        for (let i = 0; i < dataList.msg.length; i++) {
            let listItem = dataList.msg[i];
            logger.info(`123456789length ${listItem.user}:${listItem.actList.length}`)
            logger.info("启动时间" + new Date());
            for (let j = 0; j < listItem.actList.length; j++) {
                let act = await signActDao.getOneByAct(listItem.actList[j]);
                if (act.code == ErrCode.OK && act.msg) {
                    let actIpaObj = await bindTask.handleActIpaData(act.msg);
                    if (actIpaObj.msg) {
                        allActAndAppList.push(actIpaObj.msg);
                    }
                }
                else {
                    //替换为当前使用的账号
                    let current = await signActDao.getAccountList(listItem.user);
                    if (current.msg && current.msg.length > 0) {
                        await relationDao.updateManyByAct(listItem.actList[j], current.msg[0].act);
                    }
                    logger.info(`1234567890 can not find act:${listItem.actList[j]}`);
                }
            }
            logger.info("结束时间" + new Date());
            logger.info(`123456789 finishOne ${listItem.user}:${listItem.actList.length}`)
        }
        logger.info("1234567890 finished")
        await shCmdHelper.runCmd_temp1(allActAndAppList);

        /* 测试代码，先留一下，稳定了再删除
        bindTask.allActAndAppList.splice(0);
        res.send({ code: ErrCode.OK });
        let dataList: any = {
            msg: [
                { user: "t_test", actList: ["taohu548714747076@163.com", "zm3mzmzg@163.com"] },
            ]
        }
        for (let i = 0; i < dataList.msg.length; i++) {
            let listItem = dataList.msg[i];
            logger.info(`123456789length ${listItem.user}:${listItem.actList.length}`)
            logger.info("启动时间" + new Date());
            for (let j = 0; j < listItem.actList.length; j++) {
                let act = await signActDao.getOneByAct(listItem.actList[j]);
                if (act.code == ErrCode.OK && act.msg) {
                    await bindTask.handleActIpaData(act.msg);
                }
                else {
                    logger.info(`1234567890 can not find act:${listItem.actList[j]}`);
                }
            }
            logger.info("结束时间" + new Date());
            logger.info(`123456789 finishOne ${listItem.user}:${listItem.actList.length}`)
        }
        logger.info("1234567890 finished")
        shCmdHelper.runCmd_temp1(bindTask.allActAndAppList);
        */
    }

    /**
     * 上次包，批量多线程创建bundleId,只为某一个应用创建
     * @param list 苹果账号列表
     */
    public async backBatchCreateBundleid(list: any[], pid: string): Promise<CodeMsgAny> {
        let allActAndAppList: any[] = [];
        for (let i = 0; i < list.length; i++) {
            logger.info(list[i]);
            let actData = await signActDao.getOneByAct(list[i]);
            if (actData.code == ErrCode.OK && actData.msg && actData.msg.act) {
                let actIpaObj = await bindTask.handleActIpaData(actData.msg, pid);
                if (actIpaObj.msg) {
                    allActAndAppList.push(actIpaObj.msg);
                }
            }
        }
        return await shCmdHelper.runCmd_temp1(allActAndAppList);
    }

    /**
     * 找到账号要创建的说有应用bindleId
     * @param currentAct 苹果账号Obj
     * @param pid 单个应用
     */
    public async handleActIpaData(currentAct: SignActModel, pid?: string): Promise<CodeMsgAny> {
        if (currentAct.blocked == 1) {
            logger.info(`1234567890账号被封: ${currentAct.user}:${currentAct.act}`)
            return Promise.resolve({ code: ErrCode.OK, msg: null });
        }
        logger.info(`1234567890start: ${currentAct.user}:${currentAct.act}`)
        let ipaList: any;
        if (!pid) {
            /* 获取用户所有应用 */
            ipaList = await ipaFilesDao.getBindsByAct(currentAct.user);
            if (ipaList.code !== ErrCode.OK) {
                logger.error("获取bundleId异常:", JSON.stringify(ipaList));
                return Promise.resolve({ code: ErrCode.OK, msg: null });
            }
        }
        else {
            /* 单个应用 */
            let singleIpa = await ipaFilesDao.getByPid(pid);
            if (!singleIpa.msg) { return Promise.resolve({ code: ErrCode.OK, msg: null }); }
            ipaList = { msg: [singleIpa.msg] }
        }
        /* 用户没有应用直接跳过,并将当前账号和新账号状态还原 */
        if (!ipaList.msg || ipaList.msg.length < 1) {
            return Promise.resolve({ code: ErrCode.OK, msg: null });
        }
        /* 遍历应用列表，在新的账号下为应用创建bundleId */
        let tempArr: any[] = [];
        let selectArr: any[] = [];
        for (const ipa of ipaList.msg) {
            /* 暂时去重一下mainBundleId */
            let isHave = tempArr.find((element: string) => { return element == ipa.oriBundle; });
            if (isHave) {
                continue;
            } else {
                tempArr.push(ipa.oriBundle);
            }
            selectArr.push(ipa);
        }
        return Promise.resolve({ code: ErrCode.OK, msg: { act: currentAct, ipaList: selectArr } });
    }

    /**
     * 手动指定用户切换哪个账号
     * @param req 
     * @param res 
     */
    public async gaveUserOneAct(req: Request, res: Response): Promise<CodeMsgAny> {
        let result = bindExpress(req, gaveUserOneActMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "您当前的操作使记录不完整，请重新操作：" + result.error });
            return;
        }
        let user = result.value.user;
        let act = result.value.act;
        let ipaList = await ipaFilesDao.getBindsByAct(user);
        if (ipaList.code !== ErrCode.OK) {
            res.send({ code: ErrCode.BadRequest, err: "获取用户应用列表失败：" });
            return;
        }
        /* 遍历应用列表，在新的账号下为应用创建bundleId */
        let tempArr: any[] = [];
        let selectArr: any[] = [];
        for (const ipa of ipaList.msg) {
            /* 暂时去重一下mainBundleId */
            let isHave = tempArr.find((element: string) => { return element == ipa.oriBundle; });
            if (isHave) {
                continue;
            } else {
                tempArr.push(ipa.oriBundle);
            }
            selectArr.push(ipa);
        }
        let actDoc = await signActDao.getOneByAct(act);
        if (actDoc.code != ErrCode.OK || !actDoc.msg) {
            res.send({ code: ErrCode.BadRequest, err: "账号不存在" });
            return;
        }
        res.send({ code: ErrCode.OK });
        let analysis = await shCmdHelper.runCmd_Change_BundleId(actDoc.msg, null, selectArr);
        if (analysis.code !== ErrCode.OK) {
            logger.error("添加新bundleId错误: ", JSON.stringify(analysis));
            res.send({ code: ErrCode.BadRequest, err: "添加新bundleId错误:" });
            return;
        }
        /* 新账号绑定给用户 */
        let udpateRet = await signActDao.updateBindAct(act, user);
        if (udpateRet.code !== ErrCode.OK) {
            res.send({ code: ErrCode.BadRequest, err: "绑定用户失败" });
            return;
        }
        return Promise.resolve({ code: ErrCode.OK });
    }
}

export const bindTask = new BindActTask();