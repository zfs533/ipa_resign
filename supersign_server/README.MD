## 一、项目结构
```
├── README.MD
├── data 数据保存目录
│   ├── account 账号，p12，描述文件，账号添加时间文件夹
│   │   └── actAddTime.txt 账号添加时间文本文件
│   ├── code 账号验证码读取文件夹
│   ├── cret 执行openssl命令获取设备udid所需文件
│   ├── package 上传应用文件夹
│   └── template  获取设备信息文件文件夹
├── dist ts编译输出文件夹
├── node_modules nodejs模块文件夹
├── package-lock.json 项目nodejs模块详细配置信息
├── package.json 项目配置文件（启动脚本，编译命令等）
├── public 手机落地页相关文件及文件下载目录
│   ├── css 落地页样式文件夹
│   ├── data 用户激活码excel文件下载文件夹
│   ├── fonts 落地页字体文件夹
│   ├── img 落地页图片文件夹
│   ├── installationTutorial.html 下载引导
│   ├── js 落地页js文件夹
│   ├── mobileprovision 落地页跳转企业描述文件文件夹
│   └── platform 保存签名成功包文件夹
├── publish_dev.sh 代码上传到服务器脚本
├── shell   第三方脚本文件目录（ruby,python,shell）
│   ├── AddSignAccount  手动添加账号脚本文件夹
│   │   ├── AddSignAccount.py  
│   │   ├── act.txt
│   │   └── loginAccount.rb
│   ├── Analysis.py
│   ├── CheckActCert 检查证书过期和修复文件夹
│   │   ├── check_cert.py 修复无效证书
│   │   ├── check_cert.sh 查找无效证书
│   │   ├── find_certID.rb 查找证书id
│   │   └── recreate_cert.py 重新创建证书
│   ├── batchCreateBundleId.rb 多进程批量创建bundleId
│   ├── creat_cert.rb   创建证书
│   ├── create_bundleId.rb  创建bundleId
│   ├── deleteCertificate.py 删除钥匙串中证书
│   ├── deleteEmpty.py 删除空文件夹
│   ├── extractIcon.py 导出图标
│   ├── findAccounttAddTime.py 获取账号添加时间
│   ├── findDeviceCount.rb 获取账号下设备数
│   ├── findReCert.py 查询重复证书
│   ├── find_bundleId.rb 查询账号下bundleId
│   ├── import_cert.sh  导入证书
│   ├── registerDeviceID.rb 注册设备下载描述文件
│   ├── remove.rb 删除账号下bundleID
│   ├── resign.py
│   ├── src
│       ├── mobileprovision2plist.py
│       ├── readPlist.py
│       └── resign_linux.sh  签名脚本
├── src ts代码文件目录
│   ├── app.ts 项目启动运行的第一个脚本
│   ├── common 公用工具文件夹（加密，日志，验证，错误码等）
│   │   ├── aes.ts  加密解密（已弃用）
│   │   ├── codeMsg.ts  错误码管理
│   │   ├── excelDoc.ts  生成excell文件
│   │   ├── httpClient.ts http连接管理
│   │   ├── jwtTokenUtil.ts 权限验证
│   │   ├── logger.ts 日志
│   │   ├── potatoClient.ts 连接potato
│   │   ├── requestSchemaMap.ts 数据结构验证
│   │   ├── timeMgr.ts 定时器管理
│   │   ├── userIdentify.ts 用户数据对象处理
│   │   └── utils.ts 常用工具函数
│   ├── config 端口，数据库url配置文件夹
│   │   └── config.json
│   ├── controller 模块控制器（账号，应用，日志等）文件夹
│   │   ├── accountApi.ts  账号
│   │   ├── adminApi.ts 用户
│   │   ├── ipaFileApi.ts 应用
│   │   ├── newIpaApi.ts 签名落地页
│   │   ├── systemApi.ts 日志
│   │   └── testFile.ts 上传应用
│   ├── helper 执行第三方脚本文件夹
│   │   ├── ipaUdidHelper.ts 获取udid 
│   │   └── shCmdHelper.ts 执行第三方脚本
│   ├── models 数据表（账号，应用，日志等）文件夹夹
│   │   ├── activationDao.ts 激活码表
│   │   ├── adminDao.ts 用户表
│   │   ├── allow_user.ts 开启验证允许下载用户表
│   │   ├── blackIPListDao.ts 黑名单表
│   │   ├── domain.ts 允许下载用户表
│   │   ├── globalCfgDao.ts 公用配置表
│   │   ├── ipaFileDao.ts 应用表
│   │   ├── modelBaseDao.ts 基类
│   │   ├── mongoDbUtil.ts 数据库管理工具
│   │   ├── relationDao.ts 关系表
│   │   ├── signActDao.ts 账号表
│   │   ├── statisticsDao.ts 数据统计表
│   │   ├── systemLogDao.ts 日志表
│   │   └── udidTokenLogDao.ts udid管理表
│   ├── routers 路由文件夹
│   │   └── routers.ts
│   ├── task 跑任务文件夹（切换账号）
│   └── tests 本地测试文件夹，与项目无关
├── tsconfig.json ts项目配置文件
├── views 手机落地页.ejs文件夹
    ├── vipPack.ejs
    └── vipPackDl.ejs
```
## 二、配置服务器基本环境
-  按照《服务器环境配置.md》文档配置基本环境
## 三、添加苹果账号需要修改ruby fastlane底层源代码，修改内容如下：
### 1、需要修改的文件及路径如下（路径仅供参考，可用通过搜索文件的方式来查找具体路径）
```
sudo find / -name "two_step_or_factor_client.rb"
/System/Volumes/Data/Library/Ruby/Gems/2.6.0/gems/fastlane-2.129.0/spaceship/lib/spaceship/two_step_or_factor_client.rb
```
- 1:/Users/mac/.rvm/rubies/ruby-2.5.1/lib/ruby/gems/2.5.0/gems/fastlane-2.134.0/spaceship/lib/spaceship/two_step_or_factor_client.rb
- 2:/Users/mac/.rvm/rubies/ruby-2.5.1/lib/ruby/gems/2.5.0/gems/fastlane-2.134.0/spaceship/lib/spaceship/client.rb
- 3:/Users/mac/.rvm/rubies/ruby-2.5.1/lib/ruby/gems/2.5.0/gems/fastlane-2.134.0/spaceship/lib/spaceship/portal/spaceship.rb
- 4:/Users/mac/.rvm/rubies/ruby-2.5.1/lib/ruby/gems/2.5.0/gems/fastlane-2.134.0/spaceship/lib/spaceship/portal/portal_client.rb
### 2、每个文件具体修改内容，参考（苹果账号登录底层修改文件）
- - a、client.rb,spaceship.rb,partal_client.rb三个文件中的修改内容，打开（苹果账号登录底层修改文件）中的对应文件，通过查找callbk关键字，将查找结果处的所有代码，对照（苹果账号登录底层修改文件）中的文件修改即可
- - - 例:
```
苹果账号登录底层修改文件中的portal_client.rb修改
def send_login_request(user, password,callbk = nil)
response = send_shared_login_request(user, password,callbk)
return response if self.cookie.include?("myacinfo")
puts "-----------------start 2 step----------------------"
# When the user has 2 step enabled, we might have to call this method again
# This only occurs when the user doesn't have a team on App Store Connect
# For 2 step verification we use the App Store Connect back-end
# which is enough to get the DES... cookie, however we don't get a valid
# myacinfo cookie at that point. That means, after getting the DES... cookie
# we have to send the login request again. This will then get us a valid myacinfo
# cookie, additionally to the DES... cookie
# puts user
# puts password
return send_shared_login_request(user, password)
end
源代码中的该函数：
def send_login_request(user, password)
response = send_shared_login_request(user, password)
return response if self.cookie.include?("myacinfo")
puts "-----------------start 2 step----------------------"
# When the user has 2 step enabled, we might have to call this method again
# This only occurs when the user doesn't have a team on App Store Connect
# For 2 step verification we use the App Store Connect back-end
# which is enough to get the DES... cookie, however we don't get a valid
# myacinfo cookie at that point. That means, after getting the DES... cookie
# we have to send the login request again. This will then get us a valid myacinfo
# cookie, additionally to the DES... cookie
# puts user
# puts password
return send_shared_login_request(user, password)
end
修改后的代码：
def send_login_request(user, password,callbk = nil)
response = send_shared_login_request(user, password,callbk)
return response if self.cookie.include?("myacinfo")
puts "-----------------start 2 step----------------------"
# When the user has 2 step enabled, we might have to call this method again
# This only occurs when the user doesn't have a team on App Store Connect
# For 2 step verification we use the App Store Connect back-end
# which is enough to get the DES... cookie, however we don't get a valid
# myacinfo cookie at that point. That means, after getting the DES... cookie
# we have to send the login request again. This will then get us a valid myacinfo
# cookie, additionally to the DES... cookie
# puts user
# puts password
return send_shared_login_request(user, password)
end

```
- - b、two_step_or_factor_client.rb修改
- - - 1:和a步骤中的方式一样先改一遍
- - - 2:新增函数及其他修改
```
102行，新增电话号码选择函数，当账号绑定多个号码的时候默认选择+855开头的
def getPhoneNumberCount(phone_numbers)
available = phone_numbers.collect do |current|
current['numberWithDialCode']
end
if available.size >1 then
for idx in 0...available.size
if available[idx].include?("+855") then
phoneNumber = available[idx]
end
end
end
return [available.size,phoneNumber]
end
116行，handle_two_factor函数中的修改
160行，调用getPhoneNumberCount函数，判断是否绑定多个号码
160-177行代码，可以复制粘贴直接替换
phoneArr = getPhoneNumberCount(response.body["trustedPhoneNumbers"])
puts "phoneCount=#{phoneArr[0]}"
if phoneArr[0] < 2 then
code_type = 'trusteddevice'
code = ask_for_2fa_code("Please enter the #{code_length} digit code:",callbk)
body = { "securityCode" => { "code" => code.to_s } }.to_json
else
code = 'sms'
end
# User exited by entering `sms` and wants to choose phone number for SMS
puts "=============code============="
puts code 
if code == 'sms'
#   code_type = 'phone'
#   body = request_two_factor_code_from_phone_choose(response.body["trustedPhoneNumbers"], code_length)
code_type = 'trusteddevice'
body = request_two_factor_code_from_phone_choose(response.body["trustedPhoneNumbers"], code_length,callbk,phoneArr[1])
end
326行，request_two_factor_code_from_phone_choose函数中的内容直接替换
def request_two_factor_code_from_phone_choose(phone_numbers, code_length,callbk = nil,phoneNumber = nil)
puts("Please select a trusted phone number to send code to:")
available = phone_numbers.collect do |current|
current['numberWithDialCode']
end
puts "select phoneNumb is #{phoneNumber}"
puts callbk
puts phoneNumber
if callbk and phoneNumber then
chosen = phoneNumber
else
chosen = choose(*available)
end
phone_id = phone_id_from_masked_number(phone_numbers, chosen)

request_two_factor_code_from_phone(phone_id, chosen, code_length, callbk)
end
345行，request_two_factor_code_from_phone函数中的内容
def request_two_factor_code_from_phone(phone_id, phone_number, code_length, callbk = nil)
# Request code
r = request(:put) do |req|
req.url("https://idmsa.apple.com/appleauth/auth/verify/phone")
req.headers['Content-Type'] = 'application/json'
req.body = { "phoneNumber" => { "id" => phone_id }, "mode" => "sms" }.to_json
update_request_headers(req)
end

# we use `Spaceship::TunesClient.new.handle_itc_response`
# since this might be from the Dev Portal, but for 2 step
Spaceship::TunesClient.new.handle_itc_response(r.body)

puts("Successfully requested text message to #{phone_number}")

code = ask_for_2fa_code("Please enter the #{code_length} digit code you received at #{phone_number}:",callbk)
#   return { "securityCode" => { "code" => code.to_s }, "phoneNumber" => { "id" => phone_id }, "mode" => "sms" }.to_json
return { "securityCode" => { "code" => code.to_s } }.to_json
end

```
### 3、修改完成进行测试
- - - 1、登录函数传入的回调是可选参数，不传入回调函数进行登录，分别用只绑定了一个手机号和两个手机好的账号登录，都能够在输入验证码后登录成功，表示兼容原登录流程成功
- - - 2、登录函数中传入回调函数，能够在本地读取验证码文件中输入正确的验证码后登录成功，表示没问题了
- - - 3、如果1，2中测试失败，请反复检查应该修改的代码是否都已经修改了
- - - 4、测试代码参考：
```
require 'spaceship'
$content
def getYanZhenCode()
aFile = File.new("yzm.txt", "r")
if aFile then
$content = aFile.sysread(6)
puts $content
if $content.length != 6 then
sleep(1)
getYanZhenCode()
end
else
puts "failed to read file yzm.txt"
exit 11
end
aFile.close
return $content
end
def login(user, pwd)
aFile = File.new("yzm.txt", "w")
aFile.syswrite(1)
aFile.close
Spaceship::Portal.login(user, pwd,method(:getYanZhenCode))
# Spaceship::Portal.login(user, pwd)

rescue Exception => e
message = "#{e.class.name}: #{e.message}"
say message
exit 2
end

def main(argv)
user = argv[0]
pwd  = argv[1]
login(user, pwd)
end

main(ARGV)
```












