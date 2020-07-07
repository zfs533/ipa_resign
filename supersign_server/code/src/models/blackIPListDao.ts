import { Connection } from "mongoose";
import { MongoDbUtil } from "./mongoDbUtil";
import { CodeMsgAny } from "../common/codeMsg";
import { ErrCode } from "../common/codeMsg";
import { CodeMsg } from "../common/codeMsg";
import { ModelBaseDao } from "./modelBaseDao";
import { getChangeDate } from "../common/utils";

export interface IpBlackListModel {
    ip?: string,
    createDate?: Date
}
/**
 * ip白名单
 */
class IpBlackListDao extends ModelBaseDao {


    public init = (conn: Connection): Promise<CodeMsgAny> => {

        this._model = MongoDbUtil.createModel(conn, {
            name: "sysIpBlackList",
            schemaDefinition: {
                ip: { type: String, unique: true },
                createDate: { type: Date }
            }
        });

        return Promise.resolve({ code: ErrCode.OK })
    }

    public addWhitelist = (ip: string): Promise<CodeMsg<IpBlackListModel>> => {
        let now = getChangeDate();
        return MongoDbUtil.insert(this._model, { ip: ip, createDate: now });
    }

    public getWhitelistByIp = async (ip: string): Promise<CodeMsg<IpBlackListModel>> => {
        return MongoDbUtil.findOne(this._model, { ip: ip });
    }

    public deleteWhitelist = (id: string): Promise<CodeMsg<any>> => {
        return MongoDbUtil.deleteOne(this._model, { _id: id });
    }

    public totalWhitelist = () => {
        return MongoDbUtil.total(this._model, {});
    }

    public pageWhitelist = (page: number, count: number): Promise<CodeMsg<IpBlackListModel[]>> => {
        return MongoDbUtil.findMany(this._model, {}, undefined, page, count);
    }

    public updateWhitelist = (id: string, ip: any): Promise<CodeMsg<IpBlackListModel>> => {
        return MongoDbUtil.findOneAndUpdate(this._model, { _id: id }, { ip: ip.ip });
    }

}

export const ipBlackListDao = new IpBlackListDao();