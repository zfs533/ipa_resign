
#多进程批量账号同时操作，先独立一个，后面优化再合并
puts "启动时间 : " + Time.new.strftime("%M:%S")
require 'spaceship'
require 'parallel'

# 设置属性
def setPorperty(app_bId,group,container)
    appServices = [
    Spaceship.app_service.class_kit.on,
    Spaceship.app_service.access_wifi.on,
    Spaceship.app_service.associated_domains.on,
    Spaceship.app_service.auto_fill_credential.on,
    Spaceship.app_service.data_protection.unless_open,
    Spaceship.app_service.home_kit.on,
    Spaceship.app_service.wallet.on,
    Spaceship.app_service.wireless_accessory.on,
    Spaceship.app_service.inter_app_audio.on,
    Spaceship.app_service.personal_vpn.on,
    Spaceship.app_service.passbook.on,
    Spaceship.app_service.vpn_configuration.on,
    Spaceship.app_service.network_extension.on,
    Spaceship.app_service.hotspot.on,
    Spaceship.app_service.multipath.on,
    Spaceship.app_service.nfc_tag_reading.on,
    Spaceship::Portal.app_service.siri_kit.on,
    Spaceship::Portal.app_service.app_group.on,
    Spaceship::Portal.app_service.push_notification.on,
    Spaceship::Portal.app_service.cloud.on,
    Spaceship::Portal.app_service.cloud_kit.cloud_kit]

    Parallel.map(appServices, in_threads: 1) do |appService|
        app_bId.update_service(appService)
    end

    app_bId.associate_groups([group])
    app_bId.associate_cloud_containers([container])

    rescue Exception => e
    message = "#{e.class.name}: #{e.message}"
    say message
    exit 2
end

def createGcmerchatBundleId(bidarr)
    puts "开始创建拉"
    dev_cert = Spaceship::Portal.certificate.development.all.first
    puts dev_cert.owner_id
    puts bidarr
    bundleId = bidarr[0]
    # 创建iCloud bundleId
    container = Spaceship::Portal.cloud_container.find("iCloud." + bundleId)
    if container.nil?
        puts "iCloud." + bundleId
        container = Spaceship::Portal.cloud_container.create!(identifier: "iCloud." + bundleId, name: "iCloud." + bundleId)
    end

    # 创建group bundleId
    group = Spaceship::Portal.app_group.find("group." + bundleId)
    if group.nil?
        group = Spaceship::Portal.app_group.create!(group_id: "group." + bundleId, name: "group." + bundleId)
    end
    Parallel.map(bidarr, in_processes: nil) do |bid|
        pid = Process.pid
        puts "-------------------#{pid}-----------------"
        app = Spaceship::Portal.app.find(bid)
        if app.nil?
            app = Spaceship::Portal.app.create!(bundle_id: bid, name: bid)
        end
        puts "时间s: #{pid} : " + Time.new.strftime("%M:%S")
        setPorperty(app,group,container)
        puts "时间e: #{pid} : " + Time.new.strftime("%M:%S")
    end

    rescue Exception => e
        message = "#{e.class.name}: #{e.message}"
        puts message
        if message.include?"Your developer account needs to be updated.  Please visit Apple Developer Registration."  
            puts "账号被封"
            exit 7
        end
    exit 8
end

#找到插件bundleId
def getExtend(mainbid,oneAct)
    re = [mainbid]
    for idx in 0...oneAct.size
        item = oneAct[idx]
        index = item.index("=")
        if index == 7 then
        else
            isit = item.index(mainbid)
            if isit == 0 then
                re.push(item)
            end
        end
    end
    return re
end

#找出主bundleId
def getMainBundleId(oneAct)
    result = []
    mainArr = []
    for idx in 0...oneAct.size
        item = oneAct[idx]
        index = item.index("=")
        if index == 7 then
            mainbid = item[8,item.size]
            mainArr.push(mainbid)
            result.push(getExtend(mainbid,oneAct))
        end
    end
    return mainArr,result
end

def login(user, pwd, bindArr)
    puts "开始登陆"
    spaceship = Spaceship::Portal.login(user, pwd)
    all_pla_warnings = spaceship.fetch_program_license_agreement_messages
    if all_pla_warnings.count > 0
        puts "有许可协议需要更新，正在接受许可协议"
        result = spaceship.accept_license_agreement_id
    end
    
    mainArr,ctExtends = getMainBundleId(bindArr[2,bindArr.size])
    for idx in 0...ctExtends.size
        createGcmerchatBundleId(ctExtends[idx])
    end
    
    puts "正在创建推送证书"
    csr, pkey = Spaceship::Portal.certificate.create_certificate_signing_request
    mainArr.each do |bundleid|
        puts bundleid
        apscert=Spaceship::Portal.certificate.production_push.create!(csr: csr, bundle_id:bundleid)
    end

    rescue Exception => e
        message = "#{e.class.name}: #{e.message}"
        say message
        exit 1
end

def main(argv)
    puts "--------------createBundleId.rb-------------"
    groups = Array.new
    for idx in 0...argv.size
        item = argv[idx].split('-')
        groups.push(item);
        puts argv[idx]
    end
    Parallel.map(groups, in_processes: nil) do |item|
        user=item[0]
        pwd=item[1]
        puts "user     : #{user}","password : #{pwd}"
        login(user, pwd,item)
    end
    puts "-----------finished...-----------"
end

main(ARGV)
puts "结束时间 : " + Time.new.strftime("%M:%S")



