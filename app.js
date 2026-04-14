// ==================== OFFLINE-FIRST CON INDEXEDDB ====================
const DB_NAME = 'omnio_offline_db';
const DB_VERSION = 1;
let dbPromise;
let currentUser = null;
let signaturePad = null;

// Inicializar IndexedDB
async function initDB() {
    const idbLib = window.idb;
    dbPromise = idbLib.openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            if (!db.objectStoreNames.contains('orders')) {
                const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
                orderStore.createIndex('by_date', 'created_at');
            }
            if (!db.objectStoreNames.contains('clients')) db.createObjectStore('clients', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('workers')) db.createObjectStore('workers', { keyPath: 'name' });
        }
    });
    return dbPromise;
}

// Datos iniciales
async function seedData() {
    const db = await dbPromise;
    const workers = await db.getAll('workers');
    if (workers.length === 0) {
        await db.add('workers', { name: 'Mauro' });
        await db.add('workers', { name: 'Alejo' });
        await db.add('workers', { name: 'Carla' });
    }
    const clients = await db.getAll('clients');
    if (clients.length === 0) {
        await db.add('clients', { id: 1, name: 'Empresa ABC', dni: '20123456789', phone: '555-1234', location: 'Av. Central 123' });
        await db.add('clients', { id: 2, name: 'Cliente XYZ', dni: '30987654', phone: '555-9876', location: 'Calle 2' });
    }
}

// CRUD
async function getAllClients() { const db = await dbPromise; return await db.getAll('clients'); }
async function getAllWorkers() { const db = await dbPromise; return await db.getAll('workers'); }
async function getAllOrders() { const db = await dbPromise; return await db.getAll('orders'); }
async function saveOrder(order) { const db = await dbPromise; await db.put('orders', order); }
async function deleteOrder(orderId) { const db = await dbPromise; await db.delete('orders', orderId); }
async function addClient(client) { const db = await dbPromise; await db.add('clients', client); }
async function deleteClient(clientId) { const db = await dbPromise; await db.delete('clients', clientId); }
async function addWorker(name) { const db = await dbPromise; await db.add('workers', { name }); }
async function deleteWorker(name) { const db = await dbPromise; await db.delete('workers', name); }

// Login local (simulado)
async function doLogin() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();
    const validUsers = { jefe: '1234', empleado: '1234' };
    if (validUsers[username] && validUsers[username] === password) {
        currentUser = { username, role: username === 'jefe' ? 'boss' : 'employee' };
        sessionStorage.setItem('omnio_session', JSON.stringify(currentUser));
        document.getElementById('loginContainer').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
        document.getElementById('userBadge').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
        await loadInitialData();
    } else {
        const errDiv = document.getElementById('loginError');
        errDiv.innerText = 'Credenciales inválidas';
        errDiv.classList.remove('hidden');
        setTimeout(() => errDiv.classList.add('hidden'), 2000);
    }
}

// Renderizar órdenes
async function renderOrders() {
    let orders = await getAllOrders();
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    if (searchTerm) {
        orders = orders.filter(o => o.client_name?.toLowerCase().includes(searchTerm) ||
            o.client_dni?.includes(searchTerm) ||
            o.client_location?.toLowerCase().includes(searchTerm));
    }
    const sortType = document.getElementById('sortSelect')?.value;
    if (sortType === 'recent') orders.sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime));
    else orders.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));

    const container = document.getElementById('ordersList');
    if (!container) return;
    if (orders.length === 0) {
        container.innerHTML = '<div class="bg-white p-8 text-center rounded-xl text-slate-400"><i class="fas fa-inbox"></i> No hay órdenes</div>';
        return;
    }
    let html = '';
    for (let o of orders) {
        const statusMap = { pending: 'Pendiente', in_progress: 'En proceso', completed: 'Finalizado' };
        const statusColor = o.status === 'completed' ? 'bg-green-100 text-green-700' : (o.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700');
        html += `<div class="bg-white rounded-2xl shadow-sm p-4 border" data-id="${o.id}">
            <div class="flex justify-between items-start">
                <div><span class="font-mono text-xs text-slate-400">#${o.orderNumber || o.id}</span><h3 class="font-bold">${escapeHtml(o.client_name)}</h3><p class="text-xs text-slate-500"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(o.client_location || '')} | ${escapeHtml(o.client_phone || '')}</p></div>
                <span class="text-xs px-2 py-1 rounded-full ${statusColor}">${statusMap[o.status]}</span>
            </div>
            <div class="mt-2 text-sm"><i class="fas fa-tools"></i> ${escapeHtml(o.requested_service?.substring(0, 60))}</div>
            <div class="flex justify-between items-center mt-3 text-xs text-slate-400"><span><i class="far fa-calendar-alt"></i> ${new Date(o.start_datetime).toLocaleDateString()}</span><span><i class="fas fa-dollar-sign"></i> ${o.total_amount?.toFixed(2) || 0}</span></div>
            <div class="flex gap-2 mt-3"><button class="view-order-btn text-indigo-600 text-sm" data-id="${o.id}"><i class="fas fa-eye"></i> Ver detalle</button><button class="delete-order-btn text-red-500 text-sm" data-id="${o.id}"><i class="fas fa-trash"></i> Eliminar</button></div>
        </div>`;
    }
    container.innerHTML = html;
    document.querySelectorAll('.view-order-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); showOrderDetail(parseInt(btn.dataset.id)); }));
    document.querySelectorAll('.delete-order-btn').forEach(btn => btn.addEventListener('click', async (e) => { e.stopPropagation(); if (confirm('¿Eliminar orden?')) { await deleteOrder(parseInt(btn.dataset.id)); await renderOrders(); } }));
}

// Detalle orden (PDF)
async function showOrderDetail(orderId) {
    const orders = await getAllOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const modal = document.getElementById('pdfDetailModal');
    const content = document.getElementById('pdfContent');
    const productosHtml = order.products && order.products.length ?
        `<table class="w-full border-collapse text-xs"><thead><tr class="border-b"><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${order.products.map(p => `<tr><td class="px-1">${escapeHtml(p.name)}</td><td class="px-1">${p.quantity}</td><td class="px-1">$${p.unit_price.toFixed(2)}</td><td class="px-1">$${(p.quantity * p.unit_price).toFixed(2)}</td></tr>`).join('')}</tbody></table>`
        : '<p>No hay productos</p>';
    content.innerHTML = `<div class="border-b pb-3 mb-3"><h2 class="text-xl font-bold">ORDEN DE SERVICIO</h2><p>N° ${order.orderNumber} | ${new Date(order.created_at).toLocaleString()}</p></div>
    <div class="grid grid-cols-2 gap-3"><div><b>Cliente:</b> ${escapeHtml(order.client_name)}<br><b>DNI:</b> ${order.client_dni}<br><b>Tel:</b> ${order.client_phone}<br><b>Ubicación:</b> ${escapeHtml(order.client_location)}</div><div><b>Técnicos:</b> ${order.workers?.join(', ')}<br><b>Inicio:</b> ${new Date(order.start_datetime).toLocaleString()}<br><b>Término:</b> ${new Date(order.end_datetime).toLocaleString()}</div></div>
    <div><b>Servicio solicitado:</b><br>${escapeHtml(order.requested_service)}</div><div><b>Trabajo realizado:</b><br>${escapeHtml(order.performed_work)}</div>
    <div><b>Productos:</b><br>${productosHtml}</div><div class="text-right font-bold text-lg">Total: $${order.total_amount?.toFixed(2)}</div>
    <div><b>Firma:</b><br><img src="${order.signature}" class="border rounded max-h-28"></div>`;
    modal.classList.remove('hidden');
    document.getElementById('printPdfBtn').onclick = () => window.print();
    document.getElementById('closePdfModal').onclick = () => modal.classList.add('hidden');
}

// Perfil de trabajador
async function showWorkerProfile(workerName) {
    const orders = await getAllOrders();
    let workerOrders = orders.filter(o => o.workers && o.workers.includes(workerName));
    workerOrders.sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime));
    document.getElementById('profileWorkerName').innerText = workerName;
    const listContainer = document.getElementById('profileOrdersList');
    const statsDiv = document.getElementById('profileStats');
    function renderProfileOrders(ordersFiltered) {
        if (ordersFiltered.length === 0) { listContainer.innerHTML = '<p class="text-slate-400 text-center p-4">No hay órdenes asignadas.</p>'; statsDiv.innerHTML = ''; return; }
        let html = '', total = 0;
        for (let o of ordersFiltered) {
            total += o.total_amount || 0;
            html += `<div class="border rounded-xl p-3 bg-slate-50"><div class="flex justify-between"><span class="font-bold">${escapeHtml(o.client_name)}</span><span class="text-xs">${new Date(o.start_datetime).toLocaleDateString()}</span></div><p class="text-sm">${escapeHtml(o.requested_service?.substring(0, 80))}</p><div class="flex justify-between mt-1 text-xs"><span>Estado: ${o.status === 'completed' ? '✅ Finalizado' : (o.status === 'in_progress' ? '🔵 En proceso' : '🟡 Pendiente')}</span><span class="font-semibold">$${o.total_amount?.toFixed(2)}</span></div><button class="text-indigo-600 text-xs mt-1 view-order-detail" data-id="${o.id}">Ver detalle</button></div>`;
        }
        listContainer.innerHTML = html;
        statsDiv.innerHTML = `📊 Total: ${ordersFiltered.length} | Suma: $${total.toFixed(2)}`;
        document.querySelectorAll('.view-order-detail').forEach(btn => btn.addEventListener('click', (e) => { showOrderDetail(parseInt(btn.dataset.id)); }));
    }
    const startDate = document.getElementById('profileStartDate'), endDate = document.getElementById('profileEndDate');
    const apply = () => {
        let filtered = [...workerOrders];
        const start = startDate.value ? new Date(startDate.value) : null;
        const end = endDate.value ? new Date(endDate.value) : null;
        if (start) filtered = filtered.filter(o => new Date(o.start_datetime) >= start);
        if (end) { const e = new Date(end); e.setHours(23,59,59); filtered = filtered.filter(o => new Date(o.start_datetime) <= e); }
        renderProfileOrders(filtered);
    };
    document.getElementById('applyProfileFilter').onclick = apply;
    document.getElementById('clearProfileFilter').onclick = () => { startDate.value = ''; endDate.value = ''; renderProfileOrders(workerOrders); };
    renderProfileOrders(workerOrders);
    document.getElementById('workerProfileModal').classList.remove('hidden');
}

// Gestión de bibliotecas
async function openWorkersLibrary() {
    const modal = document.getElementById('workersModalLib');
    const listDiv = document.getElementById('workersListModal');
    const workers = await getAllWorkers();
    listDiv.innerHTML = workers.map(w => `<div class="flex justify-between items-center border-b py-2"><span>${escapeHtml(w.name)}</span><div><button class="view-profile-btn text-blue-600 text-xs mr-2" data-name="${escapeHtml(w.name)}"><i class="fas fa-id-card"></i> Ver perfil</button><button class="delete-worker-btn text-red-500 text-xs" data-name="${escapeHtml(w.name)}"><i class="fas fa-trash"></i></button></div></div>`).join('');
    document.querySelectorAll('.view-profile-btn').forEach(btn => btn.addEventListener('click', (e) => { modal.classList.add('hidden'); showWorkerProfile(btn.dataset.name); }));
    document.querySelectorAll('.delete-worker-btn').forEach(btn => btn.addEventListener('click', async (e) => { await deleteWorker(btn.dataset.name); await openWorkersLibrary(); await loadFormData(); }));
    modal.classList.remove('hidden');
}
async function openClientsLibrary() {
    const modal = document.getElementById('clientsModalLib');
    const listDiv = document.getElementById('clientListModal');
    const clients = await getAllClients();
    listDiv.innerHTML = clients.map(c => `<div class="border-b py-2"><b>${escapeHtml(c.name)}</b> - DNI: ${c.dni}<br><span class="text-xs">${c.phone} | ${c.location}</span><button class="delete-client-btn float-right text-red-500 text-xs" data-id="${c.id}"><i class="fas fa-trash"></i></button></div>`).join('');
    document.querySelectorAll('.delete-client-btn').forEach(btn => btn.addEventListener('click', async (e) => { await deleteClient(parseInt(btn.dataset.id)); await openClientsLibrary(); await loadFormData(); }));
    modal.classList.remove('hidden');
}

// Formulario nueva orden
async function loadFormData() {
    const clients = await getAllClients();
    const select = document.getElementById('clientSelect');
    select.innerHTML = '<option value="">-- Seleccionar cliente --</option>';
    clients.forEach(c => { select.innerHTML += `<option value="${c.id}" data-dni="${c.dni}" data-phone="${c.phone}" data-location="${c.location}">${escapeHtml(c.name)} (${c.dni})</option>`; });
    const workers = await getAllWorkers();
    const container = document.getElementById('workersChecklist');
    container.innerHTML = '';
    workers.forEach(w => { container.innerHTML += `<label class="flex items-center gap-2 text-sm"><input type="checkbox" value="${escapeHtml(w.name)}" class="worker-check"> ${escapeHtml(w.name)}</label>`; });
    if (document.getElementById('productsContainer').children.length === 0) addProductRow();
}
function addProductRow(name = '', qty = 1, price = 0) {
    const div = document.createElement('div');
    div.className = 'flex flex-wrap gap-2 items-center bg-slate-50 p-2 rounded-lg';
    div.innerHTML = `<input type="text" class="product-name flex-1 border rounded px-2 py-1 text-sm" placeholder="Producto" value="${escapeHtml(name)}"><input type="number" class="product-qty w-20 border rounded px-2 py-1" value="${qty}"><input type="number" class="product-price w-28 border rounded px-2 py-1" value="${price}" step="0.01"><span class="product-subtotal w-24 text-sm font-mono">$${(qty * price).toFixed(2)}</span><button class="remove-product text-red-500"><i class="fas fa-trash"></i></button>`;
    const qtyInp = div.querySelector('.product-qty'), priceInp = div.querySelector('.product-price'), subtotalSpan = div.querySelector('.product-subtotal');
    const update = () => { let q = parseFloat(qtyInp.value) || 0, p = parseFloat(priceInp.value) || 0; subtotalSpan.innerText = `$${(q * p).toFixed(2)}`; updateTotalMaterials(); };
    qtyInp.addEventListener('input', update); priceInp.addEventListener('input', update);
    div.querySelector('.remove-product').addEventListener('click', () => { div.remove(); updateTotalMaterials(); });
    update();
    document.getElementById('productsContainer').appendChild(div);
}
function updateTotalMaterials() {
    let total = 0;
    document.querySelectorAll('#productsContainer .product-subtotal').forEach(sp => { total += parseFloat(sp.innerText.replace('$', '')) || 0; });
    document.getElementById('totalMaterialsSpan').innerText = `$${total.toFixed(2)}`;
    return total;
}
function getProductsArray() {
    const items = [];
    document.querySelectorAll('#productsContainer > div').forEach(row => {
        const name = row.querySelector('.product-name')?.value.trim();
        if (!name) return;
        const qty = parseInt(row.querySelector('.product-qty')?.value) || 1;
        const price = parseFloat(row.querySelector('.product-price')?.value) || 0;
        items.push({ name, quantity: qty, unit_price: price, subtotal: qty * price });
    });
    return items;
}
async function submitNewOrder() {
    const clientId = document.getElementById('clientSelect').value;
    if (!clientId) { alert('Seleccione cliente'); return; }
    const clientObj = (await getAllClients()).find(c => c.id == clientId);
    const selectedWorkers = Array.from(document.querySelectorAll('#workersChecklist .worker-check:checked')).map(cb => cb.value);
    if (selectedWorkers.length === 0) { alert('Seleccione al menos un técnico'); return; }
    const requested = document.getElementById('requestedService').value.trim();
    const performed = document.getElementById('performedWork').value.trim();
    if (!requested || !performed) { alert('Complete servicios'); return; }
    const start = document.getElementById('startDatetime').value, end = document.getElementById('endDatetime').value;
    if (!start || !end) { alert('Horarios requeridos'); return; }
    if (signaturePad.isEmpty()) { alert('Firma obligatoria'); return; }
    const status = document.getElementById('orderStatus').value;
    const products = getProductsArray();
    const totalMat = products.reduce((a, b) => a + b.subtotal, 0);
    const newOrder = {
        id: Date.now(),
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        client_id: parseInt(clientId),
        client_name: clientObj.name,
        client_dni: clientObj.dni,
        client_phone: clientObj.phone,
        client_location: clientObj.location,
        workers: selectedWorkers,
        requested_service: requested,
        performed_work: performed,
        start_datetime: start,
        end_datetime: end,
        status: status,
        products: products,
        total_amount: totalMat,
        signature: signaturePad.toDataURL(),
        created_at: new Date().toISOString()
    };
    await saveOrder(newOrder);
    document.getElementById('orderModal').classList.add('hidden');
    await renderOrders();
    resetFormModal();
    alert('Orden guardada localmente');
}
function resetFormModal() {
    document.getElementById('requestedService').value = '';
    document.getElementById('performedWork').value = '';
    document.getElementById('productsContainer').innerHTML = '';
    addProductRow();
    signaturePad.clear();
    document.getElementById('orderStatus').value = 'pending';
    document.getElementById('clientSelect').value = '';
    setDefaultDates();
}
function setDefaultDates() {
    const now = new Date();
    const start = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const end = new Date(now.getTime() + 7200000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('startDatetime').value = start;
    document.getElementById('endDatetime').value = end;
}

// Inicialización
async function loadInitialData() {
    await loadFormData();
    await renderOrders();
    setDefaultDates();
}
function initEventListeners() {
    document.getElementById('newOrderFab')?.addEventListener('click', () => { document.getElementById('orderModal').classList.remove('hidden'); loadFormData(); setDefaultDates(); });
    document.getElementById('closeModalBtn')?.addEventListener('click', () => document.getElementById('orderModal').classList.add('hidden'));
    document.getElementById('saveOrderBtn')?.addEventListener('click', submitNewOrder);
    document.getElementById('addProductBtn')?.addEventListener('click', () => addProductRow());
    document.getElementById('clearSignature')?.addEventListener('click', () => signaturePad.clear());
    document.getElementById('searchInput')?.addEventListener('input', renderOrders);
    document.getElementById('sortSelect')?.addEventListener('change', renderOrders);
    document.getElementById('logoutBtn')?.addEventListener('click', () => { sessionStorage.clear(); location.reload(); });
    document.getElementById('manageClientsBtn')?.addEventListener('click', openClientsLibrary);
    document.getElementById('manageWorkersBtn')?.addEventListener('click', openWorkersLibrary);
    document.getElementById('quickAddClient')?.addEventListener('click', openClientsLibrary);
    document.getElementById('saveClientModalBtn')?.addEventListener('click', async () => {
        const name = document.getElementById('newClientNameModal').value.trim();
        const dni = document.getElementById('newClientDniModal').value.trim();
        const phone = document.getElementById('newClientPhoneModal').value.trim();
        if (!name) return;
        await addClient({ id: Date.now(), name, dni, phone, location: '' });
        document.getElementById('clientsModalLib').classList.add('hidden');
        await loadFormData();
        await renderOrders();
    });
    document.getElementById('saveWorkerModalBtn')?.addEventListener('click', async () => {
        const name = document.getElementById('newWorkerNameModal').value.trim();
        if (!name) return;
        await addWorker(name);
        document.getElementById('workersModalLib').classList.add('hidden');
        await loadFormData();
    });
    document.getElementById('closeClientsModalLib')?.addEventListener('click', () => document.getElementById('clientsModalLib').classList.add('hidden'));
    document.getElementById('closeWorkersModalLib')?.addEventListener('click', () => document.getElementById('workersModalLib').classList.add('hidden'));
    document.getElementById('closeProfileModal')?.addEventListener('click', () => document.getElementById('workerProfileModal').classList.add('hidden'));
}
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

// Arranque
const savedSession = sessionStorage.getItem('omnio_session');
if (savedSession) {
    currentUser = JSON.parse(savedSession);
    document.getElementById('loginContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('userBadge').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
    (async () => {
        await initDB();
        await seedData();
        const canvasElem = document.getElementById('signatureCanvas');
        signaturePad = new SignaturePad(canvasElem, { backgroundColor: 'white' });
        await loadInitialData();
        initEventListeners();
    })();
} else {
    document.getElementById('loginContainer').classList.remove('hidden');
}
document.getElementById('loginBtn')?.addEventListener('click', doLogin);
