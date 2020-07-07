puts "启动时间 : " + Time.new.strftime("%M:%S")
require 'spaceship'
require 'parallel'

def login(user, pwd)
    puts "开始登陆"
    spaceship = Spaceship::Portal.login(user, pwd)
    all_pla_warnings = spaceship.fetch_program_license_agreement_messages
    if all_pla_warnings.count > 0
        puts "有许可协议需要更新，正在接受许可协议"
        result = spaceship.accept_license_agreement_id
    end
    rescue Exception => e
    message = "#{e.class.name}: #{e.message}"
    say message
    exit 1
end

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


$allTargets 
$pushCers
def createGcmerchatBundleId(bidarr)
    bundleId = bidarr[0]
    # 创建iCloud bundleId
    container = Spaceship::Portal.cloud_container.find("iCloud." + bundleId)
    if container.nil?
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

def getMainBundleId()
    heads = []
    for idx in 0...$allTargets.size
        item = $allTargets[idx]
        bool = item.index("findhead");
        if bool then
            main = item.split("-findhead-");
            heads.push(main[1])
        end
    end
    return heads
end

def getExtend(mainBid)
    extendbid = [mainBid]
    $pushCers.push(mainBid)
    for idx in 0...$allTargets.size
        item = $allTargets[idx]
        bool = item.index(mainBid);
        if bool==0 and item !=mainBid then
            extendbid.push(item)
        end
    end
    return extendbid
end

def main(argv)
    puts "--------------createBundleId.rb-------------"
    user=argv[0]
    pwd=argv[1]
    puts "user     : #{user}","password : #{pwd}"
    $allTargets = Array.new
    $pushCers = Array.new
    for idx in 2...argv.size
        item = argv[idx]
        $allTargets.push(item)
    end

    heads = getMainBundleId()

    extentsBid = []
    for i in 0...heads.size
        bid = getExtend(heads[i]);
        extentsBid.push(bid);
    end
    puts extentsBid

    login(user, pwd)
    puts "时间1 : " + Time.new.strftime("%M:%S")

    extentsBid.each do |bundleid|
        createGcmerchatBundleId(bundleid)
    end
    puts "正在创建推送证书"
    csr, pkey = Spaceship::Portal.certificate.create_certificate_signing_request
    $pushCers.each do |bundleid|
        puts bundleid
        apscert=Spaceship::Portal.certificate.production_push.create!(csr: csr, bundle_id:bundleid)
    end
    puts $pushCers.size
    puts "-----------finished...-----------"
end

main(ARGV)
puts "结束时间 : " + Time.new.strftime("%M:%S")