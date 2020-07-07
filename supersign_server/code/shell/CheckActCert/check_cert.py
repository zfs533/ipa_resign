# -*- coding: utf-8 -*-
from concurrent.futures import ThreadPoolExecutor
import subprocess
import pymongo
import json
import os


def find_all_account():
    """从数据库中找到所有的账号

    Yields:
        dict -- 返回账号和密码的dict
    """
    dburl = "mongodb://ipauser:wSgdOsY1W5Asg@223.25.237.121:27017,223.25.237.121:27018,223.25.237.121:27019/ipa?replicaSet=pack"
    client = pymongo.MongoClient(dburl)
    db = client['ipa']
    collection = db['appAppleSignAct']
    acts = collection.aggregate([
        {"$group": {"_id": {"act": "$act", "pwd": "$pwd"}}},
        {"$project": {"_id": 0, "act": "$_id.act", "pwd": "$_id.pwd"}}
    ])
    for act in acts:
        yield act


def find_invalid_cert(act):
    """查找无效的证书

    Arguments:
        act {dict} -- 账号和密码的dict
    """

    actId_byte = subprocess.check_output(['ruby', 'find_certID.rb', act["act"], act['pwd']])
    actId_list = actId_byte.decode('utf-8').strip().split('\n')
    actId_dict = json.loads(actId_list[-1])
    if (actId_dict["owner_id"] in invalid_cert):
        print(actId_dict)
        os.system("ruby creat_cert.rb {0} {1} ~/SuperSign/data/account/{0}".format(act["act"], act['pwd']))


if __name__ == '__main__':
    invalid_cert = subprocess.check_output(['sh', 'check_cert.sh']).decode('utf-8')
    p = ThreadPoolExecutor(max_workers=100)
    p.map(find_invalid_cert, find_all_account())
    p.shutdown()
    print("失效证书已全部处理完成")
