#! /bin/bash

tarname="bin_mod.tar.gz"
ip="223.25.237.121"
password="rt75utmeqc5"
path="~/SuperSign/"

echo "tsc..."
tsc
echo $ip
echo "compression..."
tar zcf $tarname --exclude=public/platform/ --exclude=dist/config/ --exclude=src/config/ dist/ data/cret/ data/template/ public/ shell/ src/ views/ node_modules/ package.json tsconfig.json

echo "scp to remote..."
sshpass -p $password scp $tarname admin@$ip:$path/$tarname

echo "remove local tar..."
rm -f $tarname

echo "Server execution command..."
/usr/bin/expect <<EOF
spawn ssh "admin@$ip"
expect "*assword:" {send "$password\r"}
expect "Last login" {send "cd $path\n"}
expect "*admin*" {send "tar zxf $tarname\n"}
expect "*admin*" {send "rm -f $tarname \n"}
expect "*admin*" {send "pm2 reload ipa \n"}
expect eof
exit
EOF
