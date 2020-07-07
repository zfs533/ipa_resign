import { Connection, Model, Schema } from "mongoose";
import { CodeMsg, ErrCode, CodeMsgAny } from "../common/codeMsg";
import { MongoDbUtil } from "./mongoDbUtil";
import { ModelBaseDao } from "./modelBaseDao";
import { logger } from "../common/logger";

export enum Pid {
    MF = "MF",          //魔方
    MH = "MH",          //魔盒
    NZ = "NZ",          //牛仔
    GS = "GS",          //光速
    MDENG = "MDENG",    //摩登
    MDI = "MDI",        //魔笛
    XY = "XY",          //星云
    YQ = "YQ",          //友趣
    KXY = "KXY",        //凯旋一部
    XG = "XG",          //星光
    HY = "HY",          //花样
    XB = "XB",          //西部
    JZ = "JZ",          //金猪
    SN = "SN",          //少女一部
    KXS = "KXS",        //凯旋三部
    SNS = "SNS",        //少女三部
    CP = "CP",          //彩票
}

export interface UdidTokenModel {
    udid: string,
    pid?: string[],
    createTime?: number,
    account?: string,
}

class UdidTokenLogDao extends ModelBaseDao {
    public init = (conn: Connection) => {
        let schema = new Schema({
            udid: { type: String, index: true, unique: true },
            pid: [{ type: String }],
            account: String,
            createTime: Number
        }, { versionKey: false });

        this._model = MongoDbUtil.createModel(conn, {
            name: "appUdidLog",
            schema: schema
        });

        return Promise.resolve<CodeMsgAny>({ code: ErrCode.OK });
    }

    public findOneByUdid = (udid: string): Promise<CodeMsg<UdidTokenModel>> => {
        return MongoDbUtil.findOne(this._model, { udid });
    }

    public editUdidModel = (req: UdidTokenModel): Promise<CodeMsg<any>> => {
        let cond: any = {};
        if (req.account) {
            cond.account = req.account;
        }
        if (req.createTime) {
            cond.createTime = req.createTime;
        }
        if (req.pid) {
            cond.pid = req.pid;
        }
        // if (req.udid) {
        //     cond.udid = req.udid;
        // }
        return MongoDbUtil.updateOne(this._model, { udid: req.udid }, { $set: cond }, undefined, { upsert: true });
    }

    public findUdidByCreateTime = (time: number): Promise<CodeMsg<UdidTokenModel[]>> => {
        return MongoDbUtil.findMany(this._model, { createTime: { $lte: time } }, { createTime: Date.now() });
    }

    public getcount = () => {
        return MongoDbUtil.findCount(this._model, {});
    }

    saveUdidAndPid = async (udid: string, pid: string) => {
        let udidDoc = await this.findOneByUdid(udid);
        if (udidDoc.code !== ErrCode.OK) {
            return { code: ErrCode.Unknown, err: "查询出错" };
        }
        let pids: string[] = udidDoc.msg ? udidDoc.msg.pid : [];
        if (pids.indexOf(pid) < 0) {
            pids.push(pid);
        }
        let doc: UdidTokenModel = {
            udid: udid,
            pid: pids,
            createTime: Date.now()
        }
        let ret = await this.editUdidModel(doc);
        if (ret.code !== ErrCode.OK) {
            logger.error("保存udid出错:" + ret.err);
            return ret;
        }
        return { code: ErrCode.OK };
    }

    public findDownoadCount = async (page: number, count: number, pids?: number[]): Promise<CodeMsg<{ pid: number, count: number }[]>> => {
        let cond: any = {};
        if (pids && !pids.length) {
            cond.pid = { $in: pids };
        }
        let aggregations: any[] = [
            { $match: cond },
            { $unwind: "$pid" },
            { $group: { _id: "$pid", udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, pid: "$_id", count: { $size: "$udids" } } },
            { $skip: (page - 1) * count },
            { $limit: count },
        ];
        return MongoDbUtil.executeAggregate(this._model, aggregations);
    }

}

export const udidTokenLogDAO = new UdidTokenLogDao();