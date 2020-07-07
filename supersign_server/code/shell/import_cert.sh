#!/usr/bin/env bash

IFS=$'\n'
set -f

for cert in $(security find-identity -v | awk -F "[\"\"]" '{print $2}'); do
    echo "正在删除证书: $cert"
    security delete-certificate -c $cert "$HOME/Library/Keychains/login.keychain-db"
done

for p12 in $(find "$HOME/SuperSign/data" -name "*.p12"); do
    echo "正在安装p12证书: $p12"
    security unlock-keychain -p $(cat $HOME/SuperSign/dist/config/PWD) $HOME/Library/Keychains/login.keychain-db
    security import $p12 -k $HOME/Library/Keychains/login.keychain-db -P 123 -A -T /usr/bin/codesign
done
