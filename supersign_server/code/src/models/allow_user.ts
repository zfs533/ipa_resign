import { Connection, Schema } from "mongoose";
import { MongoDbUtil } from "./mongoDbUtil";
import { CodeMsgAny } from "../common/codeMsg";
import { ErrCode } from "../common/codeMsg";
import { CodeMsg } from "../common/codeMsg";
import { ModelBaseDao } from "./modelBaseDao";

export interface AllowUserModel {
    _id?: string,
    activationCode?: string,
    udid?: string,
}

/**
 * 检查是否为老用户（开启验证后的检查）
 */
class AllowUserDao extends ModelBaseDao {
    public init = (conn: Connection): Promise<CodeMsgAny> => {
        let schemaDefinition = new Schema({
            activationCode: { type: String, index: true, },
            udid: { type: String, index: true }
        }, { versionKey: false });
        this._model = MongoDbUtil.createModel(conn, {
            name: "sysAllowUser",
            schemaDefinition: schemaDefinition
        });
        return Promise.resolve({ code: ErrCode.OK })
    }

    public async getByActivationCode(activationCode: string): Promise<CodeMsg<AllowUserModel>> {
        return await MongoDbUtil.findOne(this._model, { activationCode: activationCode });
    }

    /* 获取udid对应的激活码列表 */
    public async getManyByUdid(udid: string): Promise<CodeMsgAny> {
        let data = await MongoDbUtil.findMany(this._model, { udid: udid });
        if (data.code !== ErrCode.OK) {
            return data;
        }
        let list = data.msg || [];
        let reList = [];
        for (let i = 0; i < list.length; i++) {
            reList.push(list[i].activationCode);
        }
        return Promise.resolve({ code: ErrCode.OK, msg: reList });
    }

    public async getByUdid(udid: string): Promise<CodeMsg<AllowUserModel>> {
        return await MongoDbUtil.findOne(this._model, { udid: udid });
    }

    public async insertOne(activationCode: string, udid: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.insert(this._model, { activationCode: activationCode, udid: udid });
    }

}

export const allowUserDao = new AllowUserDao();