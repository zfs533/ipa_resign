import { Request, Response } from "express";
import { JwtTokenUtil } from '../common/jwtTokenUtil';
import { ErrCode, CodeMsgAny } from "../common/codeMsg";
import { adminUserDao, AdminRole, AdminUserDoc } from "../models/adminDao";
import { signActDao } from "../models/signActDao";
import * as random from "string-random";
import { MongoDbUtil, TransSession } from "../models/mongoDbUtil";
import { logger } from "../common/logger";
import { relationDao } from "../models/relationDao";
import { DownloadRecordReq } from "../models/relationDao"
import { getChangeDate, DayMS, endOfDay, bindExpress, getLocalIp } from "../common/utils";
import { activationDao } from "../models/activationDao";
import { getActivationCodeMap, addUserMap, getStatisticsListMap, getOneMonthDataMap } from "../common/requestSchemaMap";
import { excelDoc } from "../common/excelDoc"
import { globalCfg } from "../models/globalCfgDao";
import * as path from 'path';
import * as fs from "fs";
import { statisticsDao } from "../models/statisticsDao";

class AdminApi {
    /** 管理用户登陆*/
    public login = async (req: Request, res: Response) => {
        let user = req.body;
        if (!user || !user.loginName || !user.password) {
            res.send({ code: ErrCode.BadRequest, err: "用户登陆信息不能为空" });
            return;
        }
        let loginName = String(user.loginName).trim();
        let loginPwd = String(user.password).trim();

        let result = await adminUserDao.getByLoginName(loginName);
        if (result.code !== ErrCode.OK) {
            res.send(result);
            return;
        }
        let dbUser = result.msg
        if (!dbUser) {
            res.send({ code: ErrCode.LoginNameNotExist, err: "用户不存在" });
            return;
        } else if (dbUser.password !== loginPwd) {
            res.send({ code: ErrCode.PasswordError, err: "密码错误" });
            return;
        }

        let token = JwtTokenUtil.token(loginName, req.path);
        if (token) {
            let update = await adminUserDao.updateAdmin({ _id: dbUser._id }, { token: token });
            if (update.code !== ErrCode.OK) {
                res.send(update);
                return;
            }
            res.send({ code: ErrCode.OK, msg: { loginName: dbUser.loginName, token: token, role: dbUser.role } });
            return;
        }
        res.send({ code: ErrCode.InternalServerError });
    }
    /**
     * 退出登陆
     */
    public logout = async (req: Request, res: Response) => {
        let token = req.header("Authorization");
        if (token) {
            let loginName = JwtTokenUtil.getNameFromToken(token);
            let update = await adminUserDao.updateAdmin({ loginName }, { token: "invalid" });//token 设置为无效
            if (update.code !== ErrCode.OK) {
                res.send(update);
                return;
            }
        }
        res.send({ code: ErrCode.OK });
    }

    public modifyPassword = async (req: Request, res: Response) => {
        let admin = req.body;
        let oldPassword = admin.oldPassword
        let newPassword = admin.newPassword
        let token = req.header("Authorization");
        if (token) {
            let loginName = JwtTokenUtil.getNameFromToken(token);
            let result = await adminUserDao.getByLoginName(loginName);
            if (result.code !== ErrCode.OK) {
                res.send(result);
                return;
            }
            let dbUser = result.msg
            if (dbUser) {
                if (oldPassword !== dbUser.password) {
                    res.send({ code: ErrCode.PasswordError });
                    return;
                }
                if (newPassword.length < 6) {
                    res.send({ code: ErrCode.DataError, err: "密码不能少于6位" });
                    return;
                }
                let update = await adminUserDao.updateAdmin({ loginName: loginName }, { password: newPassword });
                if (update.code !== ErrCode.OK) {
                    res.send(update);
                    return;
                }
                res.send({ code: ErrCode.OK });
                return;
            }
        }
        res.send({ code: ErrCode.BadRequest });
    }

    /** 获取登陆用户信息*/
    public getAdminInfo = async (req: Request, res: Response) => {
        let token = req.header("Authorization");
        let loginName = JwtTokenUtil.getNameFromToken(token);
        if (!loginName) {
            res.send({ code: ErrCode.InvalidToken, err: "InvalidToken" });
            return;
        }
        let result = await adminUserDao.getByLoginName(loginName);
        if (result.code !== ErrCode.OK) {
            res.send(result);
            return;
        }
        let dbUser = result.msg
        if (dbUser) {
            res.send({ code: ErrCode.OK, msg: { loginName: dbUser.loginName, role: dbUser.role } });
        } else {
            res.send({ code: ErrCode.OK, msg: {} });
        }
    }

    /**
     * 添加用户
     * @memberof AdminApi
     */
    public addAccount = async (req: Request, res: Response) => {
        let resultV = bindExpress(req, addUserMap);
        if (resultV.error) {
            res.send({ code: ErrCode.BadRequest, err: resultV.error });
            return;
        }
        let user = resultV.value;
        let regex = /^[\u4e00-\u9fa5_a-zA-Z0-9]+$/
        if (!regex.test(user.loginName) || user.loginName.length < 2 || user.loginName.length > 18) {
            res.send({ code: ErrCode.BadRequest, err: "用户名只能是长度为2-18的英文字母,数字和中文" })
            return;
        }

        let dbUser = await adminUserDao.getByLoginName(user.loginName);
        if (dbUser.msg) {
            res.send({ code: ErrCode.LoginNameExist, err: "用户已存在" });
            return;
        }
        if (user.password.length < 6) {
            res.send({ code: ErrCode.DataError, err: "密码不能少于6位" });
            return;
        }
        if (user.setDlNumber <= 0) {
            res.send({ code: ErrCode.DataError, err: "安装数不能小于0" });
            return;
        }
        /* 检查是否又可用苹果账号 */
        let newAppleAccount = await signActDao.bindAct();
        if (!newAppleAccount.msg) {
            res.send({ code: ErrCode.NoActError, err: "账号不足，请先添加苹果账号" });
            return;
        }
        let now = getChangeDate();
        let uidMax = await adminUserDao.getMaxUid();
        if (uidMax.code !== ErrCode.OK) {
            res.send(uidMax);
            return;
        }
        let uid: number;
        if (!uidMax.msg) {
            uid = 10000
        }
        uid = uidMax.msg.uid + Math.floor((Math.random() * 20));
        let key = random(16);
        let userRole = user.role || AdminRole.USERS;
        let isLocalEnv = this.checkEnvLocal();
        if (isLocalEnv) {
            let session = null;
            let insert = { uid: uid, loginName: user.loginName, password: user.password, role: userRole, remark: user.remark, createDate: now, updateDate: now, setDlNumber: user.setDlNumber, key: key };
            let result = await adminUserDao.addUser(insert, session);
            if (result.code !== ErrCode.OK) {
                res.send(result);
                return;
            }
            let signActs = await signActDao.bindActByAdd(user.loginName, session);
            if (signActs.code !== ErrCode.OK) {
                res.send(signActs);
                return;
            }
            res.send({ code: ErrCode.OK });
        }
        else {
            //绑定一个账号,出错则回滚
            let ret = await MongoDbUtil.runTrans(async (session: TransSession) => {
                let insert = { uid: uid, loginName: user.loginName, password: user.password, role: userRole, remark: user.remark, createDate: now, updateDate: now, setDlNumber: user.setDlNumber, key: key };
                let result = await adminUserDao.addUser(insert, session);
                if (result.code !== ErrCode.OK) {
                    return result;
                }
                let signActs = await signActDao.bindActByAdd(user.loginName, session);
                if (signActs.code !== ErrCode.OK) {
                    return signActs;
                }
                return { code: ErrCode.OK }
            })
            res.send(ret);
        }
    }

    private checkEnvLocal(): boolean {
        let ip = getLocalIp();
        return (ip == "192.168.1.119");
    }

    /** 修改用户信息*/
    public updateAdminInfo = async (req: Request, res: Response) => {
        let _id = req.body._id;
        let role = req.body.role;
        let remark = req.body.remark;
        let setDlNumber = req.body.setDlNumber;
        if (!_id) {
            res.send({ code: ErrCode.BadRequest });
            return;
        }
        let result = await adminUserDao.updateAdmin({ _id }, { role, remark, setDlNumber });

        if (result.code === ErrCode.OK) {
            res.send({ code: ErrCode.OK });
        } else {
            res.send({ code: ErrCode.OK, msg: { ...result.msg } });
        }

    }

    /**当前用户数据 */
    userData = async (req: Request, res: Response) => {
        let token = req.header("Authorization");
        let loginName = JwtTokenUtil.getNameFromToken(token);
        if (!loginName) {
            res.send({ code: ErrCode.InvalidToken, err: "InvalidToken" });
            return;
        }
        let ret = await this.getDataByUser(loginName);
        res.send(ret);
    }

    //获取信息
    getDataByUser = async (loginName: string): Promise<CodeMsgAny> => {
        let ret = await Promise.all([
            /* 获取用户信息 */
            adminUserDao.getByLoginName(loginName),
        ])
        let retErr = ret.filter(e => e.code !== ErrCode.OK)
        if (retErr.length) {
            return retErr[0];
        }
        /* 设备安装数总数 */
        let setDlNum = ret[0].msg.setDlNumber;
        let data = await statisticsDao.getDeviceCountByUser(loginName);
        let devices = data.msg.length > 0 ? data.msg[0].newDeCount : 0;
        /* 下载设备总数 */
        let downloadNum: number = devices > setDlNum ? setDlNum : devices;
        data = await relationDao.getUserDownloadCount(loginName);
        /* 总下载量 */
        let adminDao = await statisticsDao.getDownloadCountByUser(loginName);
        let dlCount = adminDao.msg.length > 0 ? adminDao.msg[0].dlCount : 0;
        let totalDownloadNum = dlCount;
        /* 当日设备新增数 */
        let deviceData = await statisticsDao.getCurrentDayNewDevice(loginName);
        let newDeviceNum: number = deviceData.msg ? deviceData.msg.newDeCount : 0;
        /* 剩余设备总数 = 设备安装总数-下载设备总数 */
        let laveNum = setDlNum - downloadNum;
        return { code: ErrCode.OK, msg: { newDeviceNum: newDeviceNum, uid: ret[0].msg.uid, loginName: loginName, role: ret[0].msg.role, laveNum: laveNum, dlNum: downloadNum, totalDownloadNum: totalDownloadNum } };
    }

    //获得所有用户下载量，剩余下载量
    getAllUser = async (req: Request, res: Response) => {
        let pageNo = req.body.pageNo;
        let countNo = req.body.pageSize;
        let loginName = req.body.loginName
        let ret = await Promise.all([
            adminUserDao.pageAdmin(pageNo, countNo, loginName),
            adminUserDao.getCount(loginName)
        ])
        let retErr = ret.filter(e => e.code !== ErrCode.OK)
        if (retErr.length) {
            res.send(retErr[0]);
            return;
        }
        let data = ret[0].msg;
        let result = [];
        for (let i = 0; i < data.length; i++) {
            let dataFile = await statisticsDao.getDeviceCountByUser(data[i].loginName);
            /* 设备安装数 */
            let devices = dataFile.msg.length > 0 ? dataFile.msg[0].newDeCount : 0;
            /* 剩余设备数 */
            data[i].laveNum = data[i].setDlNumber - devices;
            let adminDao = await statisticsDao.getDownloadCountByUser(data[i].loginName);
            let dlCount = adminDao.msg.length > 0 ? adminDao.msg[0].dlCount : 0;
            /* 下载总量 */
            data[i].dled = dlCount;
            let obj = {
                devices: devices,
                dled: dlCount,
                laveNum: data[i].laveNum,
                setDlNumber: data[i].setDlNumber,
                loginName: data[i].loginName,
                role: data[i].role,
                createDate: data[i].createDate,
                updateDate: data[i].updateDate,
                remark: data[i].remark,
            }
            result.push(obj);
        }
        res.send({ code: ErrCode.OK, msg: { data: result, total: ret[1].msg } })
    }

    addDownloadTimes = async (req: Request, res: Response) => {
        let user = req.body.loginName;
        let times = req.body.times;
        let addRet = await adminUserDao.addDlTimes(user, times);
        res.send(addRet)
    }

    //获取当前用户所有应用曲线图数据
    getAllApp = async (req: Request, res: Response) => {
        let cond: DownloadRecordReq = {
            userName: req.body.userName,
            startTime: req.body.startTime,
            endTime: req.body.endTime
        }
        cond.startTime -= 2 * DayMS;
        cond.endTime += 2 * DayMS;
        // let ret = await relationDao.getAllDataForApp(cond);
        let ret = await statisticsDao.getDataByuser(cond);
        res.send(ret);
    }

    //获取当前用户某一应用曲线图数据
    getOneApp = async (req: Request, res: Response) => {
        let cond: DownloadRecordReq = {
            userName: req.body.userName,        //用户
            pid: req.body.pid,
            startTime: req.body.startTime,
            endTime: req.body.endTime
        }
        cond.startTime -= 2 * DayMS;
        cond.endTime += 2 * DayMS;
        let ret = await relationDao.getOneDayDataForApp(cond);
        res.send(ret);
    }

    //管理员界面，获取当前所有应用每日数据
    getDatas = async (req: Request, res: Response) => {
        let cond: DownloadRecordReq = {
            startTime: Number(req.query.startTime),
            endTime: Number(req.query.endTime)
        }
        cond.startTime -= 2 * DayMS;
        cond.endTime += 2 * DayMS;
        // let ret = await relationDao.getAllUsersDateForApp(cond);
        let ret = await statisticsDao.getAllData(cond);
        res.send(ret);
    }

    getUserNames = async (req: Request, res: Response) => {
        let userNames = await adminUserDao.getUserNames()
        res.send(userNames);
    }
    /**
     * 导出用户数据统计Excel表格
     * @param req 
     * @param res 
     */
    public async getStatisticsList(req: Request, res: Response): Promise<CodeMsgAny> {
        let result = bindExpress(req, getStatisticsListMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "获取用户数据统计格式错误" + result.error });
            return;
        }
        let user = result.value.user;
        let data = await statisticsDao.getStatisticsByUser(user);
        if (data.code !== ErrCode.OK) {
            logger.error("获取用户数据统计出错拉：" + JSON.stringify(data));
            res.send(data);
            return;
        }
        /* 先删除 */
        let packageDir = path.join(process.cwd(), `.public/data/`);
        let packZipPath = path.join(packageDir, `${user}_statistics.xlsx`);
        if (fs.existsSync(packZipPath)) {
            fs.unlinkSync(packZipPath);
        }
        let list = data.msg || [];
        list.sort((a: any, b: any) => { return a.day.getTime() - b.day.getTime(); });
        let reData: any[] = [["用户名", "账号销量", "设备下载量", "新增设备量", "下载总量", "日期"]];
        for (let i = 0; i < list.length; i++) {
            if (list[i]) {
                let month = (list[i].day.getMonth() + 1) < 10 ? "0" + (list[i].day.getMonth() + 1) : (list[i].day.getMonth() + 1);
                let date = list[i].day.getDate() < 10 ? "0" + list[i].day.getDate() : list[i].day.getDate();
                let day = list[i].day.getFullYear() + "-" + month + "-" + date;
                reData.push([list[i].user, list[i].actCount, list[i].deCount, list[i].newDeCount, list[i].dlCount, day]);
            }
        }
        let filePath = path.join(process.cwd(), `./public/data/${user}_statistics.xlsx`);
        await excelDoc.createFile(user, { "数据统计": reData }, filePath);
        let url = globalCfg.ipaDomain + `/data/${user}_statistics.xlsx`;
        res.send({ code: ErrCode.OK, msg: url });
    }

    /**
     * 下载用户激活码Excel文件
     * @param req 
     * @param res 
     */
    public async getActivationCodeList(req: Request, res: Response): Promise<CodeMsgAny> {
        let result = bindExpress(req, getActivationCodeMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "获取用户激活码格式错误" + result.error });
            return;
        }
        let user = result.value.user;
        let data = await activationDao.getCodeListByUser(user);
        if (data.code !== ErrCode.OK) {
            logger.error("获取用户激活码出错拉：" + JSON.stringify(data));
            res.send(data);
            return;
        }
        /* 先删除 */
        let packageDir = path.join(process.cwd(), `.public/data/`);
        let packZipPath = path.join(packageDir, `${user}_code.xlsx`);
        if (fs.existsSync(packZipPath)) {
            fs.unlinkSync(packZipPath);
        }
        let list = data.msg || [];

        // 剩余下载次数
        let userData = await adminApi.getDataByUser(user);
        if (userData.code !== ErrCode.OK) {
            res.send(userData);
            return
        }
        /* 激活码小于剩余次数，补上 */
        if (userData.msg.laveNum > list.length) {
            await activationDao.addActivationCode(user, userData.msg.laveNum - list.length);
            data = await activationDao.getCodeListByUser(user);
            list = data.msg
        }
        let reData: any[] = [["用户名", "激活码"]];
        for (let i = 0; i < userData.msg.laveNum; i++) {
            if (list[i])
                reData.push([list[i].user, list[i].activationCode]);
        }
        let filePath = path.join(process.cwd(), `./public/data/${user}_code.xlsx`);
        await excelDoc.createFile(user, { "code": reData }, filePath);
        let url = globalCfg.ipaDomain + `/data/${user}_code.xlsx`;
        res.send({ code: ErrCode.OK, msg: url });
    }

    /**
     * 获取用户全部可用的激活码
     * @param req 
     * @param res 
     */
    public async getAllActivationCode(req: Request, res: Response): Promise<CodeMsgAny> {
        let result = bindExpress(req, getActivationCodeMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "获取用户激活码格式错误" + result.error });
            return;
        }
        let user = result.value.user;
        let data = await activationDao.getCodeListByUser(user);
        if (data.code !== ErrCode.OK) {
            logger.error("获取用户激活码出错拉：" + JSON.stringify(data));
            res.send(data);
            return;
        }

        let list: [] = data.msg || [];

        // 剩余下载次数
        let userData = await adminApi.getDataByUser(user);
        if (userData.code !== ErrCode.OK) {
            res.send(userData);
            return
        }
        /* 激活码小于剩余次数，补上 */
        if (userData.msg.laveNum > list.length) {
            await activationDao.addActivationCode(user, userData.msg.laveNum - list.length);
            data = await activationDao.getCodeListByUser(user);
            list = data.msg
        }
        let activationCodes = list.map((value: any) => value.activationCode)
        res.send({ code: ErrCode.OK, msg: activationCodes });
    }

    /**
     * 获取用户某月数据
     * @param req 
     * @param res 
     */
    public async getOneMonthData(req: Request, res: Response) {
        let result = bindExpress(req, getOneMonthDataMap);
        if (result.error) {
            res.send({ code: ErrCode.BadRequest, err: "参数错误" + result.error });
            return;
        }
        let cond: DownloadRecordReq = {
            userName: result.value.userName,
            startTime: result.value.startTime,
            endTime: result.value.endTime,
        }
        let ret = await statisticsDao.getStatisticsByMonth(cond);
        res.send(ret);
    }

}

export const adminApi = new AdminApi();

