// حالة التطبيق
const AppState = {
    devices: [],
    systemConfig: {
        type: 'offgrid',
        sunHours: 5,
        panelWattage: 400,
        batteryType: 200,
        safetyMargin: 20,
        systemLoss: 15
    },
    results: null
};

// إدارة الحالة
class StateManager {
    static loadState() {
        try {
            const savedState = localStorage.getItem('solarCalculatorState');
            if (savedState) {
                Object.assign(AppState, JSON.parse(savedState));
            }
        } catch (e) {
            console.error('Failed to load state:', e);
        }
    }
    
    static saveState() {
        try {
            localStorage.setItem('solarCalculatorState', JSON.stringify(AppState));
        } catch (e) {
            console.error('Failed to save state:', e);
        }
    }
    
    static resetState() {
        AppState.devices = [];
        AppState.results = null;
        this.saveState();
    }
}

// إدارة الأجهزة
class DeviceManager {
    static categories = {
        cooling: 'أجهزة التبريد',
        heating: 'أجهزة التدفئة',
        fans: 'مراوح',
        lighting: 'الإضاءة',
        electronics: 'أجهزة إلكترونية',
        kitchen: 'أجهزة المطبخ',
        other: 'أخرى'
    };

    static validateDevice(device) {
        return device && 
               typeof device.name === 'string' && 
               !isNaN(device.wattage) && device.wattage >= 0 &&
               !isNaN(device.hours) && device.hours >= 0 &&
               !isNaN(device.count) && device.count > 0;
    }

    static addDevice(device) {
        if (!this.validateDevice(device)) {
            throw new Error('بيانات الجهاز غير صالحة');
        }
        
        AppState.devices.push({
            ...device,
            dailyConsumption: (device.wattage * device.hours * device.count / 1000).toFixed(2)
        });
        
        StateManager.saveState();
    }

    static updateDevice(index, updates) {
        if (index < 0 || index >= AppState.devices.length) {
            throw new Error('فهرس الجهاز غير صالح');
        }
        
        const updatedDevice = {...AppState.devices[index], ...updates};
        if (!this.validateDevice(updatedDevice)) {
            throw new Error('بيانات الجهاز غير صالحة');
        }
        
        AppState.devices[index] = updatedDevice;
        StateManager.saveState();
    }

    static deleteDevice(index) {
        if (index < 0 || index >= AppState.devices.length) {
            throw new Error('فهرس الجهاز غير صالح');
        }
        
        AppState.devices.splice(index, 1);
        StateManager.saveState();
    }
}

// الحسابات الشمسية
class SolarCalculator {
    static calculate() {
        if (AppState.devices.length === 0) {
            throw new Error('لا توجد أجهزة مضافة');
        }

        const { totalConsumption, maxLoad, consumptionByCategory } = this.calculateConsumption();
        
        const totalWithMargin = totalConsumption * (1 + AppState.systemConfig.safetyMargin/100);
        const totalWithLoss = totalWithMargin * (1 + AppState.systemConfig.systemLoss/100);
        
        const panelsCount = Math.ceil(totalWithLoss / (AppState.systemConfig.sunHours * AppState.systemConfig.panelWattage * 0.8));
        const inverterSize = Math.ceil(maxLoad * 1.25);
        
        let batteryResults = {};
        if (AppState.systemConfig.type !== 'ongrid') {
            batteryResults = {
                capacity: (totalWithLoss / (12 * 0.8 * 0.5)).toFixed(2),
                count: Math.ceil(totalWithLoss / (12 * AppState.systemConfig.batteryType * 0.8 * 0.5))
            };
        }
        
        AppState.results = {
            totalConsumption: totalConsumption/1000,
            totalWithMargin: totalWithMargin/1000,
            totalWithLoss: totalWithLoss/1000,
            panelsCount,
            inverterSize: inverterSize/1000,
            batteryResults,
            consumptionByCategory,
            sunHours: AppState.systemConfig.sunHours
        };
        
        StateManager.saveState();
        return AppState.results;
    }

    static calculateConsumption() {
        let totalConsumption = 0;
        let maxLoad = 0;
        const consumptionByCategory = {};
        
        Object.keys(DeviceManager.categories).forEach(cat => {
            consumptionByCategory[cat] = 0;
        });
        
        AppState.devices.forEach(device => {
            const deviceLoad = device.wattage * device.count;
            const deviceConsumption = deviceLoad * device.hours;
            totalConsumption += deviceConsumption;
            
            if (deviceLoad > maxLoad) {
                maxLoad = deviceLoad;
            }
            
            const category = this.classifyDevice(device.name);
            consumptionByCategory[category] += deviceConsumption;
        });
        
        return { totalConsumption, maxLoad, consumptionByCategory };
    }

    static classifyDevice(deviceName) {
        const lowerName = deviceName.toLowerCase();
        
        if (lowerName.includes('ثلاجة') || lowerName.includes('مكيف')) {
            return 'cooling';
        } else if (lowerName.includes('سخان') || lowerName.includes('دفاية') || 
                   lowerName.includes('جك') || lowerName.includes('هيتر') || 
                   lowerName.includes('مدفأة')) {
            return 'heating';
        } else if (lowerName.includes('مروحة')) {
            return 'fans';
        } else if (lowerName.includes('لمبة') || lowerName.includes('led')) {
            return 'lighting';
        } else if (lowerName.includes('شاحن') || lowerName.includes('حاسوب') || 
                  lowerName.includes('تلفزيون') || lowerName.includes('راوتر')) {
            return 'electronics';
        } else if (lowerName.includes('خلاط') || lowerName.includes('كبة') || 
                  lowerName.includes('ميكروويف') || lowerName.includes('فرن') ||
                  lowerName.includes('غسالة')) {
            return 'kitchen';
        }
        
        return 'other';
    }
}

// إدارة الواجهة
class UIManager {
    static init() {
        StateManager.loadState();
        this.bindEvents();
        this.renderDevices();
        this.updateSystemDiagram();
        
        if (AppState.devices.length > 0) {
            try {
                SolarCalculator.calculate();
                this.renderResults();
                ChartManager.renderAllCharts();
            } catch (error) {
                console.error('Error calculating initial results:', error);
            }
        }
    }
    
    static bindEvents() {
        document.getElementById('system-type').addEventListener('change', (e) => {
            AppState.systemConfig.type = e.target.value;
            StateManager.saveState();
            this.updateSystemDiagram();
        });
        
        document.getElementById('calculate-btn').addEventListener('click', () => {
            try {
                SolarCalculator.calculate();
                this.renderResults();
                ChartManager.renderAllCharts();
            } catch (error) {
                alert(error.message);
            }
        });
        
        document.getElementById('modeToggle').addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            document.getElementById('modeToggle').innerHTML = isDark ? 
                '<i class="fas fa-sun"></i> وضع النهار' : 
                '<i class="fas fa-moon"></i> وضع الليل';
            
            if (AppState.results) {
                ChartManager.renderAllCharts();
            }
        });
    }
    
    static updateSystemDiagram() {
        document.querySelectorAll('.connection-diagram').forEach(diagram => {
            diagram.style.display = 'none';
        });
        
        const diagramId = `${AppState.systemConfig.type}-diagram`;
        document.getElementById(diagramId).style.display = 'block';
    }
    
    static renderDevices() {
        const devicesList = document.getElementById('devices-list');
        devicesList.innerHTML = '';
        
        if (AppState.devices.length === 0) {
            devicesList.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 20px;">
                        لا توجد أجهزة مضافة حتى الآن
                    </td>
                </tr>
            `;
            return;
        }
        
        let totalConsumption = 0;
        
        AppState.devices.forEach((device, index) => {
            const consumption = (device.wattage * device.hours * device.count / 1000).toFixed(2);
            totalConsumption += parseFloat(consumption);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${device.name || 'غير معروف'}</td>
                <td>${device.wattage}</td>
                <td>${device.count}</td>
                <td>${device.hours}</td>
                <td>${consumption}</td>
                <td>
                    <button onclick="UIManager.editDevice(${index})">تعديل</button>
                    <button onclick="UIManager.deleteDevice(${index})">حذف</button>
                </td>
            `;
            
            devicesList.appendChild(row);
        });
        
        const totalRow = document.createElement('tr');
        totalRow.style.fontWeight = 'bold';
        totalRow.style.backgroundColor = 'rgba(0,0,0,0.05)';
        totalRow.innerHTML = `
            <td colspan="4">المجموع</td>
            <td>${totalConsumption.toFixed(2)}</td>
            <td></td>
        `;
        devicesList.appendChild(totalRow);
    }
    
    static editDevice(index) {
        try {
            const device = AppState.devices[index];
            if (!device) throw new Error('الجهاز غير موجود');
            
            const newHours = parseFloat(prompt('عدد الساعات الجديدة:', device.hours));
            const newCount = parseInt(prompt('العدد الجديد:', device.count));
            
            if (isNaN(newHours)) throw new Error('يجب إدخال عدد ساعات صحيح');
            if (isNaN(newCount)) throw new Error('يجب إدخال عدد أجهزة صحيح');
            
            DeviceManager.updateDevice(index, {
                hours: newHours,
                count: newCount
            });
            
            this.renderDevices();
            if (AppState.results) {
                SolarCalculator.calculate();
                this.renderResults();
                ChartManager.renderAllCharts();
            }
        } catch (error) {
            alert(error.message);
        }
    }
    
    static deleteDevice(index) {
        if (confirm('هل تريد حذف هذا الجهاز؟')) {
            DeviceManager.deleteDevice(index);
            this.renderDevices();
            
            if (AppState.devices.length === 0) {
                document.getElementById('results').style.display = 'none';
            } else if (AppState.results) {
                SolarCalculator.calculate();
                this.renderResults();
                ChartManager.renderAllCharts();
            }
        }
    }
    
    static renderResults() {
        if (!AppState.results) return;
        
        const { results } = AppState;
        const title = document.getElementById('report-title').value || 'نتائج الحساب';
        document.getElementById('results-title').textContent = title;
        
        let batteryResults = '';
        if (AppState.systemConfig.type !== 'ongrid') {
            batteryResults = `
                <div class="result-item">
                    <span>سعة البطاريات المطلوبة:</span>
                    <span class="result-value">${results.batteryResults.capacity} أمبير/ساعة</span>
                </div>
                <div class="result-item">
                    <span>عدد البطاريات (${AppState.systemConfig.batteryType}أمبير):</span>
                    <span class="result-value">${results.batteryResults.count} بطارية</span>
                </div>
            `;
        }
        
        document.getElementById('results-content').innerHTML = `
            <div class="result-item">
                <span>الاستهلاك اليومي:</span>
                <span class="result-value">${results.totalConsumption.toFixed(2)} ك.و.س</span>
            </div>
            <div class="result-item">
                <span>بعد إضافة ${AppState.systemConfig.safetyMargin}% أمان:</span>
                <span class="result-value">${results.totalWithMargin.toFixed(2)} ك.و.س</span>
            </div>
            <div class="result-item">
                <span>بعد إضافة ${AppState.systemConfig.systemLoss}% فاقد:</span>
                <span class="result-value">${results.totalWithLoss.toFixed(2)} ك.و.س</span>
            </div>
            <div class="result-item">
                <span>عدد الألواح الشمسية (${AppState.systemConfig.panelWattage} واط):</span>
                <span class="result-value">${results.panelsCount}</span>
            </div>
            <div class="result-item">
                <span>حجم الانفرتر المطلوب:</span>
                <span class="result-value">${results.inverterSize.toFixed(2)} ك.و</span>
            </div>
            ${batteryResults}
            <div class="result-item">
                <span>ساعات الذروة الشمسية:</span>
                <span class="result-value">${results.sunHours} ساعات/يوم</span>
            </div>
        `;
        
        document.getElementById('results').style.display = 'block';
    }
}

// إدارة الرسوم البيانية
class ChartManager {
    static charts = {
        consumption: null,
        system: null,
        comparison: null
    };

    static destroyAll() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
    }

    static renderAllCharts() {
        if (!AppState.results) return;
        
        this.destroyAll();
        this.renderConsumptionChart();
        this.renderSystemChart();
        this.renderComparisonChart();
    }

    static renderConsumptionChart() {
        const ctx = document.getElementById('consumptionChart').getContext('2d');
        const { consumptionByCategory } = AppState.results;
        
        const activeCategories = Object.entries(consumptionByCategory)
            .filter(([_, value]) => value > 0);
        
        this.charts.consumption = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: activeCategories.map(([cat]) => DeviceManager.categories[cat]),
                datasets: [{
                    data: activeCategories.map(([_, value]) => value),
                    backgroundColor: activeCategories.map(([cat]) => this.getCategoryColor(cat)),
                    borderWidth: 1,
                    borderColor: 'var(--chart-card-bg)',
                    hoverOffset: 15
                }]
            },
            options: this.getChartOptions('استهلاك الأجهزة', AppState.results.totalConsumption * 1000)
        });
    }

    static renderSystemChart() {
        const ctx = document.getElementById('systemChart').getContext('2d');
        const { results, systemConfig } = AppState;
        
        const systemData = [
            results.panelsCount * systemConfig.panelWattage,
            systemConfig.batteryType * (results.batteryResults?.count || 0),
            results.inverterSize * 1000,
            results.totalConsumption * 1000 * (systemConfig.safetyMargin/100),
            results.totalConsumption * 1000 * (systemConfig.systemLoss/100)
        ].filter(value => value > 0);
        
        const labels = ['الألواح الشمسية', 'البطاريات', 'الإنفرتر'];
        if (systemConfig.safetyMargin > 0) labels.push('نسبة الأمان');
        if (systemConfig.systemLoss > 0) labels.push('الفاقد');
        
        this.charts.system = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: systemData,
                    backgroundColor: [
                        '#f39c12',
                        '#2ecc71',
                        '#e74c3c',
                        '#3498db',
                        '#95a5a6'
                    ].slice(0, labels.length),
                    borderWidth: 1,
                    borderColor: 'var(--chart-card-bg)'
                }]
            },
            options: this.getChartOptions('مكونات النظام')
        });
    }

    static renderComparisonChart() {
        const ctx = document.getElementById('comparisonChart').getContext('2d');
        const { results, systemConfig } = AppState;
        
        const production = results.panelsCount * systemConfig.panelWattage * systemConfig.sunHours / 1000;
        const consumption = results.totalWithLoss;
        const surplus = Math.max(0, production - consumption);
        
        this.charts.comparison = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['الإنتاج', 'الاستهلاك', 'الفائض'],
                datasets: [{
                    label: 'كيلوواط ساعة',
                    data: [production, consumption, surplus],
                    backgroundColor: [
                        'rgba(46, 204, 113, 0.7)',
                        'rgba(231, 76, 60, 0.7)',
                        'rgba(52, 152, 219, 0.7)'
                    ],
                    borderColor: [
                        '#2ecc71',
                        '#e74c3c',
                        '#3498db'
                    ],
                    borderWidth: 2,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.raw} ك.و.س`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'كيلوواط ساعة' }
                    }
                }
            }
        });
    }

    static getCategoryColor(category) {
        const colors = {
            cooling: '#3498db',
            heating: '#e74c3c',
            fans: '#9b59b6',
            lighting: '#f1c40f',
            electronics: '#34495e',
            kitchen: '#2ecc71',
            other: '#95a5a6'
        };
        return colors[category] || '#cccccc';
    }

    static getChartOptions(title, totalValue) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: title },
                legend: {
                    position: 'bottom',
                    rtl: true,
                    labels: {
                        usePointStyle: true,
                        padding: 25,
                        font: { size: 13 },
                        boxWidth: 15
                    }
                },
                tooltip: {
                    callbacks: totalValue ? {
                        label: (context) => {
                            const percentage = Math.round((context.raw / totalValue) * 100);
                            return `${context.label}: ${percentage}% (${(context.raw/1000).toFixed(2)} ك.و.س)`;
                        }
                    } : undefined
                }
            }
        };
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    if (!document.fonts.check('16px Tajawal')) {
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
    }
    
    UIManager.init();
});

// جعل الدوال متاحة عالمياً للاستدعاء من HTML
window.UIManager = UIManager;
