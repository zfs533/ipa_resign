# -*- coding: utf-8 -*-
from concurrent.futures import ThreadPoolExecutor
import subprocess
import pymongo
import os


def find_all_account():
    """从数据库中找到所有的账号

    Yields:
        dict -- 返回账号和密码的dict
    """
    dburl = "mongodb://localhost/ipa"
    client = pymongo.MongoClient(dburl)
    db = client['ipa']
    collection = db['appAppleSignAct']
    acts = collection.aggregate([
        {"$group": {"_id": {"act": "$act", "pwd": "$pwd"}}},
        {"$project": {"_id": 0, "act": "$_id.act", "pwd": "$_id.pwd"}}
    ])
    for act in acts:
        yield act


def clear_cert():
    """ 清理本机证书
    """

    identity = subprocess.check_output(
        ['security', "find-identity", "-v"]).decode('utf-8')
    cert_hash_list = []
    for cert in identity.split("\n")[0:-2]:
        cert_hash = cert.split(" ")[3]
        if "iPhone" in cert_hash:
            cert_hash = cert.split(" ")[2]
        cert_hash_list.append(cert_hash)
    for cert in cert_hash_list:
        command = 'security delete-certificate -Z {} "$HOME/Library/Keychains/login.keychain-db"'.format(
            cert)
        os.system(command)
        print("证书{}已删除".format(cert))


def recreate_cert(act):
    """重新创建证书

    Arguments:
        act {dict} -- 账号和密码的dict
    """

    command = "ruby ../creat_cert.rb {0} {1} ../../data/account/{0} test.txt".format(
        act["act"], act["pwd"])
    result = subprocess.check_output(command).decode('utf-8')
    print(result)
    # os.system(command)
    print("账号 {} 已经重新创建证书".format(act["act"]))


if __name__ == '__main__':
    clear_cert()
    p = ThreadPoolExecutor(max_workers=100)
    p.map(recreate_cert, find_all_account())
    p.shutdown()
    print("证书已全部重新生成完成")
