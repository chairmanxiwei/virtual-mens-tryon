function initMapSelect(opts) {
  var unitSel = opts.unitSel;
  var onWeather = opts.onWeather || function(){};
  var weatherEndpoint = opts.weatherEndpoint || null;
  var mapEl = document.getElementById('map');
  var searchInput = document.getElementById('place-search');
  var searchBtn = document.getElementById('search-btn');
  var autoLocateBtn = document.getElementById('auto-locate-btn');
  var favoriteList = document.getElementById('favorite-list');
  var saveBtn = document.getElementById('save-place');
  
  if (!mapEl || !window.AMap) { return; }
  
  // 初始化高德地图
  var map = new AMap.Map('map', {
    zoom: 5,
    center: [116.4074, 39.9042], // 北京坐标
    zoomEnable: true,
    dragEnable: true,
    doubleClickZoom: true
  });
  
  var marker = null;
  
  // 设置标记
  function setMarker(lng, lat, name) {
    // 清除原有标记
    if (marker) {
      marker.setMap(null);
    }
    
    // 创建新标记
    marker = new AMap.Marker({
      position: [lng, lat],
      title: name || ('选择位置: ' + lat.toFixed(4) + ', ' + lng.toFixed(4)),
      map: map
    });
    
    // 打开信息窗口
    var infoWindow = new AMap.InfoWindow({
      content: name || ('选择位置: ' + lat.toFixed(4) + ', ' + lng.toFixed(4)),
      offset: new AMap.Pixel(0, -30)
    });
    infoWindow.open(map, [lng, lat]);
    
    // 暴露选择的坐标到全局，供AI搭配使用
    try { window.aiGeo = { lat: lat, lon: lng, name: name || '' }; } catch(e){}
    // 获取天气信息
    var endpoint = weatherEndpoint || '/api/ai-service/weather';
    var url = endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'lat=' + lat + '&lon=' + lng + '&unit=' + unitSel.value;
    fetch(url)
      .then(function(r){ return r.json(); })
      .then(function(j){ if (j && j.success) { onWeather(j.data); cacheLocation({ lat, lon: lng, name }); } })
      .catch(function(){ onWeather({ tempC:22, tempF:71.6, wind:3, condition:0 }); });
  }
  
  // 地图点击事件
  map.on('click', function(e){    
    var lng = e.lnglat.getLng();
    var lat = e.lnglat.getLat();
    setMarker(lng, lat, '地图选点');
  });
  
  // 缓存位置到本地存储
  function cacheLocation(loc) {
    try {
      var list = JSON.parse(localStorage.getItem('favoritePlaces') || '[]');
      list = list.filter(function(x){ return !(x.lat===loc.lat && x.lon===loc.lon); });
      list.unshift({ lat: loc.lat, lon: loc.lon, name: loc.name || '未命名' });
      list = list.slice(0, 10);
      localStorage.setItem('favoritePlaces', JSON.stringify(list));
      renderFavorites();
    } catch(e){}
  }
  
  // 渲染收藏地点
  function renderFavorites() {
    favoriteList.innerHTML = '';
    var list = [];
    try { list = JSON.parse(localStorage.getItem('favoritePlaces') || '[]'); } catch(e){}
    list.forEach(function(item, idx){
      var btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = item.name || ('地点'+(idx+1));
      btn.addEventListener('click', function(){ 
        map.setCenter([item.lon, item.lat]);
        map.setZoom(10);
        setMarker(item.lon, item.lat, item.name);
      });
      favoriteList.appendChild(btn);
    });
  }
  
  // 保存地点
  saveBtn.addEventListener('click', function(){
    if (!marker) { return; }
    var position = marker.getPosition();
    var lng = position.getLng();
    var lat = position.getLat();
    var name = prompt('为当前地点命名:', '收藏地点');
    cacheLocation({ lat: lat, lon: lng, name: name || '收藏地点' });
  });
  
  // 搜索地点（兼容 AMap v2 插件机制）
  function searchPlace(keyword) {
    AMap.plugin('AMap.PlaceSearch', function () {
      var ps = new AMap.PlaceSearch({ pageSize: 1, pageIndex: 1 });
      ps.search(keyword, function (status, result) {
        try {
          if (status === 'complete' && result.poiList && result.poiList.pois && result.poiList.pois.length > 0) {
            var poi = result.poiList.pois[0];
            var loc = poi.location || poi._location;
            var lng = (loc && (loc.lng || (loc.getLng && loc.getLng()))) || 116.4074;
            var lat = (loc && (loc.lat || (loc.getLat && loc.getLat()))) || 39.9042;
            var name = poi.name || '搜索结果';
            map.setCenter([lng, lat]);
            map.setZoom(12);
            setMarker(lng, lat, name);
          }
        } catch(e){}
      });
    });
  }
  
  // 搜索按钮点击事件
  searchBtn.addEventListener('click', function(){
    var q = searchInput.value.trim();
    if (q) searchPlace(q);
  });
  
  // 自动定位按钮点击事件
  if (autoLocateBtn) {
    autoLocateBtn.addEventListener('click', function(e){
        e.preventDefault();
        var icon = autoLocateBtn.querySelector('i');
        if(icon) icon.className = 'fas fa-spinner fa-spin';
        
        // 使用浏览器的地理位置 API
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(function(position) {
            var lat = position.coords.latitude;
            var lng = position.coords.longitude;
            
            // 通过逆地理编码获取位置名称
            var geocoder = new AMap.Geocoder({
              radius: 1000,
              extensions: "base"
            });
            
            geocoder.getAddress([lng, lat], function(status, result) {
              if(icon) icon.className = 'fas fa-location-arrow';
              if (status === 'complete' && result.regeocode) {
                var name = result.regeocode.formattedAddress;
                map.setCenter([lng, lat]);
                map.setZoom(12);
                setMarker(lng, lat, name);
              } else {
                // 如果逆地理编码失败，使用经纬度
                map.setCenter([lng, lat]);
                map.setZoom(12);
                setMarker(lng, lat, '当前位置');
              }
            });
          }, function(error) {
            if(icon) icon.className = 'fas fa-location-arrow';
            console.error(error);
            alert('定位服务失败，请检查位置权限或手动搜索。');
          });
        } else {
          if(icon) icon.className = 'fas fa-location-arrow';
          alert('您的浏览器不支持地理位置服务。');
        }
    });
  }

  // 初始化时渲染收藏地点
  renderFavorites();
}
