import { Connection, Schema } from "mongoose";
import { MongoDbUtil, TransSession } from "./mongoDbUtil";
import { CodeMsgAny, ErrCode, CodeMsg } from "../common/codeMsg";
import { ModelBaseDao } from "./modelBaseDao";
import { logger } from "../common/logger";

export interface SystemModel {
    /* 用户ip */
    ip: string,
    /* 请求接口 */
    uri: string,
    /* 用户名 */
    loginName: string,
    /* 请求参数 */
    action: string
    /* 请求数据 */
    data: object,
    /* 操作时间 */
    createDate: Date,
    /* 描述 */
    discription?: string,
    /* 是否显示 1显示，0不显示 */
    isshow?: number
}

/**
 * 日志
 */
class SystemLogDao extends ModelBaseDao {
    /* 操作描述 */
    private logTable: Array<any> = [
        ["/ipa/getAct", "获取账号列表"],
        ["/ipa/addAct", "添加账号"],
        ["/ipa/deleteAct", "删除账号"],
        ["/ipa/addIpaFile", "添加应用"],
        ["/ipa/updateIpaFile", "更新应用信息"],
        ["/ipa/getIpaFile", "获取应用列表"],
        ["/ipa/deleteIpaFile", "删除应用"],
        ["/ipa/enable", "更改应用状态"],
        ["/admin/login", "登录"],
        ["/admin/logout", "退出登录"],
        ["/admin/modifyPassword", "修改密码"],
        ["/admin/getUserInfo", "获取用户信息"],
        ["/admin/addAccount", "添加用户"],
        ["/admin/updateAccount", "修改用户信息"],
        ["/admin/all", "获取用户列表数据"],
        ["/admin/addDlTimes", "添加设备数"],
        ["/admin/allapp", "获取所有应用统计图数据"],
        ["/admin/oneapp", "获取单个应用统计图数据"],
        ["/ipa/addIpWhiteList", "添加白名单"],
        ["/ipa/deleteIpWhiteList", "删除白名单"],
        ["/ipa/getIpWhiteList", "查看白名单"],
        ["/ipa/updateIpWhiteList", "修改白名单"],
        ["/ipa/getOpearteLogs", "查看日志列表"],
        ["/ipa/upload/", "上传应用"],
        ["/ipa/open", "解析应用"],
        ["/admin/now", "首页数据展示刷新"],
        ["/ipa/oriBundles", "获取应用详情下拉列表框数据"],
        ["/ipa/getUser", "获取用户详情下拉列表框数据"],
        ["/admin/datas", "获取所有用户曲线图数据"],
        ["/admin/username", "获取用户列表"],
        ["/ipa/checkIpa", "更新应用验证状态"],
        ["/ipa/getYZCode", "发送验证码"],
        ["/admin/activationCode", "导出激活码"],
        ["/admin/statistics", "导出统计数据"],
    ];
    /* 不需要展示的请求接口 */
    private igloreLog: Array<any> = [
        "/ipa/getOpearteLogs",
        "/admin/all",
        "/admin/now",
        "/admin/allapp",
        "/ipa/getUser",
        "/admin/datas",
        "/admin/now",
        "/admin/username",
        "/ipa/getIpWhiteList",
        "/admin/getUserInfo",
        "/ipa/getIpaFile",
        "/ipa/getAct",
        "/ipa/getIpWhiteList",
        "/admin/oneapp",
        "/ipa/oriBundles",
        "/admin/oneMonth",
        "/admin/changeActTask",
        "/admin/updateReTask",
        "/admin/createByUser",
        "/admin/synchronizeData",
    ];

    public init = (conn: Connection): Promise<CodeMsgAny> => {
        let schema = new Schema({
            loginName: { type: String, required: true },
            ip: { type: String },
            uri: { type: String },
            action: { type: String },
            data: { type: Object },
            createDate: { type: Date, index: true },
            discription: { type: String },
            isshow: { type: Number }
        }, { versionKey: false })
        this._model = MongoDbUtil.createModel(conn, {
            name: "sysLog",
            schema: schema
        });
        /* 每天删除一次日志 */
        setInterval(this.deleteLog.bind(this), 24 * 60 * 60 * 1000);
        return Promise.resolve({ code: ErrCode.OK })
    }

    /**
     * 添加日志
     * @param loginName 用户名 
     * @param ip 用户IP
     * @param uri 请求接口
     * @param data 请求数据
     */
    public async addLoginLog(loginName: string, ip: string, uri: string, data?: any): Promise<CodeMsg<SystemModel>> {
        if (ip) {
            var reg: RegExp = /\d+.\d+.\d+.\d+/g
            if (ip.match(reg) && ip.match(reg).length > 0) {
                ip = ip.match(reg)[0];
            }
        }
        let now = new Date();
        let isIgnore = this.igloreLog.find((element: any) => { return element == uri; });
        let discription = this.getOptionByUri(uri) || uri;
        let isshow = isIgnore ? 0 : 1;
        return MongoDbUtil.insert(this._model, { loginName: loginName, ip: ip, uri: uri, action: JSON.stringify(data), data: data, createDate: now, discription: discription, isshow: isshow });
    }

    public pageLog = (page: number, count: number, conditions?: any, sort?: any, body?: any): Promise<CodeMsg<SystemModel[]>> => {
        if (!conditions) {
            conditions = {};
        }
        return MongoDbUtil.findMany(this._model, conditions, sort, page, count, body);
    }

    private getOptionByUri = (uri: string): string => {
        let list = this.logTable;
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            if (item[0] == uri || uri.indexOf(item[0]) > -1) {
                return item[1];
            }
        }
        return null
    }

    /**
     * 删除日志,只保留30天日志
     */
    public async deleteLog() {
        let oldTime = new Date().getTime() - (30 * 24 * 60 * 60 * 1000)
        let date = new Date(oldTime);
        let conditions = { createDate: { $lt: date } }
        let ret = await MongoDbUtil.deleteMany(this._model, conditions);
        if (ret.code !== ErrCode.OK) {
            logger.info("删除日志失败");
        }
    }
}

export const systemLogDAO = new SystemLogDao();