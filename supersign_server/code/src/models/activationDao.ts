
import { ModelBaseDao } from "./modelBaseDao";
import { Connection, Schema } from "mongoose";
import { CodeMsgAny, ErrCode } from "../common/codeMsg";
import { MongoDbUtil } from "./mongoDbUtil";
import { logger } from "../common/logger";
import { createBundleId } from "../common/utils";
const shortid = require('shortid');

export interface ActivationDoc {
    _id?: string,
    /* 激活码8位 */
    activationCode: string,
    /* 用户 */
    user: string,
    /* 是否已被使用 0未使用，1已使用 */
    isUsed: number,
}
/* 激活码表 用户校验*/
class ActivationDao extends ModelBaseDao {
    public init = async (conn: Connection): Promise<CodeMsgAny> => {
        let schema = new Schema({
            activationCode: { type: String, index: true, unique: true },
            user: { type: String, default: "" },
            isUsed: { type: Number, default: 0 }
        }, { versionKey: false });
        this._model = MongoDbUtil.createModel(conn, {
            name: "activationCode",
            schema: schema
        })
        return Promise.resolve({ code: ErrCode.OK });
    }

    /**
     * 获取校验吗对应的用户
     * @param activationCode 校验码
     */
    public async getUserByActivationCode(activationCode: string): Promise<CodeMsgAny> {
        let data = await MongoDbUtil.findOne(this._model, { activationCode: activationCode });
        if (data.code !== ErrCode.OK) {
            logger.error("查找验证码失败：" + JSON.stringify(data));
            return data;
        }
        return data;
    }

    /**
     * 获取所有数据
     */
    public async getAll(): Promise<CodeMsgAny> {
        return await MongoDbUtil.findMany(this._model, {});
    }

    /**
     * 插入一条数据
     * @param activationCode 校验吗
     */
    public async inserOne(activationCode: string, user: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.insert(this._model, { activationCode: activationCode, user: user, isUsed: 0 });
    }

    /**
     * 测试用的初始化表数据
     */
    public async initData(): Promise<CodeMsgAny> {
        let allData = await this.getAll();
        if (allData.code !== ErrCode.OK) {
            logger.error("查询激活码出错：" + JSON.stringify(allData));
            return allData;
        }
        logger.info(allData.msg.length);
        if (allData.msg.length < 1) {
            for (let i = 0; i < 100; i++) {
                await this.inserOne(shortid.generate(), "t_test");
            }
        }
        return Promise.resolve({ code: ErrCode.OK });
    }

    /**
     * 给用户增加激活码
     * @param user 用户
     * @param count 数量
     */
    public async addActivationCode(user: string, count: number): Promise<CodeMsgAny> {
        for (let i = 0; i < count; i++) {
            await this.inserOne(createBundleId(Math.random().toString(32).substr(0, 16), 8), user);
        }
        return Promise.resolve({ code: ErrCode.OK });
    }

    /**
     * 根据用户名获取用户激活码列表(未使用的)
     * @param user 用户
     */
    public async getCodeListByUser(user: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.findMany(this._model, { user: user, isUsed: { $ne: 1 } });
    }

    public async updateOne(activationCode: string, isUsed: number): Promise<CodeMsgAny> {
        return await MongoDbUtil.updateOne(this._model, { activationCode: activationCode }, { $set: { isUsed: isUsed } });
    }

    /**
     * 获取激活码列表对应的所有用户
     * @param codeList 激活码列表
     */
    public async aggregateUserListByCodeList(codeList: any[]): Promise<CodeMsgAny> {
        let aggregates: any = [
            { $match: { activationCode: { $in: codeList } } },
            { $group: { _id: null, user: { $addToSet: "$user" } } },
            { $project: { _id: 0, userList: "$user" } }
        ]
        let data = await MongoDbUtil.executeAggregate(this._model, aggregates);
        if (data.code != ErrCode.OK) {
            return data;
        }
        let list = data.msg || [];
        let reList = [];
        for (let i = 0; i < list.length; i++) {
            for (let j = 0; j < list[i].userList.length; j++) {
                reList.push(list[i].userList[j]);
            }
        }
        return Promise.resolve({ code: ErrCode.OK, msg: reList });
    }

}

export const activationDao = new ActivationDao();