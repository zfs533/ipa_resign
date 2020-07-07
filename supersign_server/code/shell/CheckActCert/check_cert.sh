#!/usr/bin/env bash

IFS=$'\n'
set -f

for cert in $(security find-identity -v | grep 'CSSMERR_TP_CERT_REVOKED'); do
    cert=$(echo $cert | awk -F "[\"\"]" '{print $2}')
    echo "无效证书: $cert"
    security delete-certificate -c $cert "$HOME/Library/Keychains/login.keychain-db"
done
