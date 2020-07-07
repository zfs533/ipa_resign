# -*- coding: utf-8 -*
"""
查询钥匙串中重复证书
"""
import os


def writeFiles():
    """
    查询有效证书，并写入文件
    """
    os.system(
        "security find-identity -v")
    os.system(
        "security find-identity -v > ./test.txt")


def readFiles():
    """
    读取文件，输出重复证书信息
    """
    f = open("./test.txt")
    line = f.readline()
    tempList = []
    while line:
        start = line.find(": ")
        end = line.find(")\"")
        if start > 0 and end > 0:
            cert = line[start+1:end+1]
            if cert in tempList:
                print("repeat cert=>", cert)
            else:
                tempList.append(cert)
        line = f.readline()
    f.close()


if __name__ == '__main__':
    writeFiles()
    readFiles()
