export enum ErrCode {
    OK = 200,
    BadRequest = 400,//错误请求
    InvalidToken = 401,//无效token
    IpRejected = 402,//IP被拒绝
    NotFound = 404,
    InternalServerError = 500,//服务器错误
    Unknown = 0,//未知错误
    MongoErr = 10000,//数据库错误

    LoginNameExist = 201,
    LoginNameNotExist = 202,
    PasswordError = 203,
    VerifyCodeError = 204,


    MasterErr = 10001,
    HttpErr = 10002,
    SmsErr = 10003,
    CosErr = 10004,
    MtClientNotConnected = 10005,
    MtClientTimeout = 10006,
    MvFileErr = 10010,
    GetBankBinErr = 10011,
    RedisErr = 10012,
    StartSessionErr = 10013,
    StartTransErr = 10014,
    CommitTransErr = 10015,
    AbortTransErr = 10016,
    RunTransErr = 10017,
    EndSessionErr = 10018,
    WXCheckErr = 10019,
    WXCheckNull = 10020,
    RedisNullErr = 10030,
    ApnsErr = 10031,


    LoginFail = 2000,
    DestroySessionFail = 2001,
    LoginExpired = 2002,
    Unauthorized = 2003,
    UserForbiddenFail = 2004,//封号错误错误

    MissConfig = 5000,
    SysError = 5001,
    NowApiError = 5005,
    AliICPCheckError = 5006,
    DataError = 5002, // 数据异常 不整合
    NoActError = 5003, //没有签名账号了
    BindActError = 5004, //备用账号异常
    DeviceFull = 5007,//当前账号下设备数已满
    NotFindBunldId = 5008,//bundleId未找到
    ResignErr = 5009,//重签名出错啦
    AppleError = 7, // Apple ID账号被封，请检查
    upgradeErr = 5, //上传更新包错误，传错包了
    ReAddAccount = 5010, //重复添加苹果账号
    MaxUdid = 4,//账号下udid大于等于100
}

const ErrorMessage: any = {
    // resign_linux.sh
    131: "codesign 签名失败，请检查证书是否过期过或是否唯一",
    132: "请检查服务器密码文件是否存在或是否正确",
    133: "从描述文件中提取签名所需要的文件出错",
    134: "修改bundleID出错",
    135: "描述文件转plist文件出错",
    136: "在描述文件中取bundleID出错",
    137: "拷贝应用到.app文件夹出错",
    138: "解压ipa出错",

    // registerDeviceID.rb
    1: "登陆失败",
    2: "通过udid查找设备失败",
    3: "添加udid失败",
    4: "账号下udid大于等于100",
    5: "BundleID未找到",
    6: "创建或下载描述文件失败",
    7: "Apple ID账号被封，请检查",
    8: "ruby 崩溃日志",
}

export interface CodeMsg<T> {
    code: ErrCode;
    msg?: T;
    err?: any;
}

export type CodeMsgAny = CodeMsg<any>;
export type CodeMsgVoid = CodeMsg<void>;

export function errMessage(code: ErrCode, err?: any): CodeMsgAny {
    return {
        code,
        err
    };
}

export function dataMessage<T>(data: T): CodeMsg<T> {
    return {
        code: ErrCode.OK,
        msg: data,
    };
}

export function PrintErrMessage(code: number) {
    let message = ErrorMessage[code]
    return message;
}