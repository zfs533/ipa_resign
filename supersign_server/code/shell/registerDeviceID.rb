puts "启动时间 : " + Time.new.strftime("%M:%S")
require 'spaceship'
# require 'parallel'

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

def findDevicesUdid(udid)
    puts "Find devices udid."
    device=Spaceship::Portal.device.find_by_udid(udid, include_disabled: true)
    rescue Exception => e
        message = "#{e.class.name}: #{e.message}"
        puts message
        exit 2
end

def canAddudid(udid)
    devices = Spaceship::Portal.device.all(include_disabled: true)
    for device in devices do
        device.enable!
    end
    puts "startChange#{devices.count}endChange" #该日志不能删除
    puts "Determine if device id can be added."
    device=findDevicesUdid(udid)
    if device
        puts "==> this device udid already exists: #{udid}"
        can=false
    else
        puts "==> this device udid was not found: #{udid}"
        puts "==> current number of devices: #{devices.count}"
        if devices.count >= 100
            puts "==> device udid has reached the upper limit"
            can=false
            exit 4
        else
            can=true
        end
    end

    rescue Exception => e
        message = "#{e.class.name}: #{e.message}"
        puts message
        if message.include?"Your developer account needs to be updated.  Please visit Apple Developer Registration."  
            exit 7
        else
            exit 4
        end
end

def findBundleId(bundleids, path,udid)
    bundleids.length.times.map do |i|
        Thread.new do
            puts "--------------Find bundleId--------------"
            bundleid = bundleids[i]
            puts bundleid
            app=Spaceship::Portal.app.find(bundleid)
            if !app
                puts "==> this findBundleId: #{bundleid} not found."
                exit 5
            end
            # 更新profiles中的udid
            updateDevices(bundleid, path,udid)
        end
    end.map(&:join)

    rescue Exception => e
        message = "#{e.class.name}: #{e.message}"
        puts message
        exit 5
end

def addUdid(name, udid)
    puts "Add a new device udid."
    puts "startUdid#{udid}endUdid"  #该日志不能删除
    Spaceship::Portal.device.create!(name: name, udid: udid)
    
	rescue Exception => e
		message = "#{e.class.name}: #{e.message}"
		puts message
		exit 3
end

def updateDevices(bundleid, path, udid)
    
    cert = Spaceship::Portal.certificate.development.all.first
    ret = 0
    profileList = Spaceship::Portal.provisioning_profile.development.find_by_bundle_id(bundle_id: bundleid)
    myProfile = nil
    profileList.each do |profile|
        if profile.nil? || (!profile.nil? && !(profile.name.include? udid))
            ret = ret + 1
        else
            puts "描述文件赋值"
            myProfile = profile
        end
    end

    puts "ret==" + ret.to_s()
    puts "profileList.length==" + profileList.length.to_s()
    # puts "描述文件名字为： " + myProfile.name
    if ret == profileList.length
        puts "正在创建描述文件"
        myProfile = Spaceship::Portal.provisioning_profile.development.create!(
            bundle_id: bundleid, 
            certificate: cert, 
            name: bundleid+udid)
        File.write("#{path}/#{bundleid}#{udid}.mobileprovision", myProfile.download)
        return
    end

    puts "下载描述文件..."
    myProfile.devices = Spaceship::Portal.device.all
    myProfile = myProfile.update!
    puts bundleid
    puts udid
    puts udid + bundleid
    File.write("#{path}/#{bundleid}#{udid}.mobileprovision", myProfile.download)

	rescue Exception => e
		message = "#{e.class.name}: #{e.message}"
		puts message
		exit 6
end

def registeredDevice(argv)
	#### params
	# 账号、密码
    user=argv[0]
	pwd=argv[1]
	# 设备名称（有规律的字符串：iPhone0-iPhone99）、设备ID（获取到的udid）
    uname=argv[2]
    udid=argv[3]
    
    # bundleid（app id,更换账号后需要替换）
    bundleIdArr = Array.new
    bundleIdArr.push(argv[4])

    # 下载目录 从系统根目录查找（/Users/mac/Documents/Cert）
    path=argv[5]

    puts "user     : #{user}","password : #{pwd}","udidname : #{uname}","udid     : #{udid}","bundlieID: #{argv[4]}","path     : #{path}"
    puts "-----------------------------"
    for idx in 6...argv.size
        bundleIdArr.push(argv[4]+"."+argv[idx])
        puts argv[idx]
    end
    #### methond
    # 登录
    login(user, pwd)

    # 如果路径不存在则创建路径
    FileUtils.mkdir_p(path) unless File.exists?(path)

    # 判断是否可以添加udid
    if canAddudid(udid)
        # 添加udid
        addUdid(uname, udid)
    end

    # 检查bundleid是否存在,不存在就直接中断运行,更换新账号使用
    findBundleId(bundleIdArr, path, udid)

end
registeredDevice(ARGV)
puts "结束时间 : " + Time.new.strftime("%M:%S")