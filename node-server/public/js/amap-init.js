// 高德地图初始化
let map = null;
let marker = null;

// 初始化地图
function initMap(center = [116.397428, 39.90923], zoom = 13) {
    map = new AMap.Map('map-container', {
        center: center,
        zoom: zoom,
        viewMode: '3D' // 可选 2D 或 3D
    });

    // 添加默认标记
    marker = new AMap.Marker({
        position: center,
        map: map
    });

    // 点击地图更新标记
    map.on('click', function(e) {
        const lnglat = e.lnglat;
        if (marker) {
            marker.setPosition(lnglat);
        } else {
            marker = new AMap.Marker({
                position: lnglat,
                map: map
            });
        }
        // 将选中的坐标保存到隐藏域或触发后续操作
        console.log('选中坐标：', lnglat);
        // 可选：调用天气接口等
    });
}

// 搜索地点
function searchPlace(keyword) {
    if (!keyword) return;
    AMap.plugin('AMap.PlaceSearch', function() {
        const placeSearch = new AMap.PlaceSearch({
            pageSize: 5,
            pageIndex: 1,
            city: '全国', // 搜索范围
            map: map,     // 搜索结果自动在地图上标点
            autoFitView: true // 自动调整地图视野
        });
        placeSearch.search(keyword, function(status, result) {
            if (status === 'complete' && result.info === 'OK') {
                // 可选：定位到第一个结果
                if (result.poiList && result.poiList.pois.length > 0) {
                    const poi = result.poiList.pois[0];
                    map.setCenter([poi.location.lng, poi.location.lat]);
                    if (marker) marker.setPosition([poi.location.lng, poi.location.lat]);
                }
            } else {
                alert('未找到地点');
            }
        });
    });
}

// 绑定搜索按钮事件
document.addEventListener('DOMContentLoaded', function() {
    // 初始化地图，默认北京
    initMap([116.397428, 39.90923], 13);

    // 搜索按钮
    const searchBtn = document.getElementById('search-btn'); // 根据实际按钮ID调整
    const searchInput = document.getElementById('search-input');
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', function() {
            const keyword = searchInput.value.trim();
            searchPlace(keyword);
        });
        // 支持回车搜索
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchBtn.click();
            }
        });
    }

    // 自动定位
    const autoLocateBtn = document.getElementById('auto-locate-btn');
    if (autoLocateBtn) {
        autoLocateBtn.addEventListener('click', function() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        const lnglat = [position.coords.longitude, position.coords.latitude];
                        map.setCenter(lnglat);
                        if (marker) marker.setPosition(lnglat);
                    },
                    function(error) {
                        alert('无法获取当前位置');
                    }
                );
            } else {
                alert('浏览器不支持定位');
            }
        });
    }
});