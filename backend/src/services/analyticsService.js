const dayjs = require('dayjs');
const { db } = require('../db');

function money(value) {
  return Number(value || 0);
}

function localDayRange(date = dayjs()) {
  const start = dayjs(date).startOf('day');
  return {
    start: start.toISOString(),
    end: start.add(1, 'day').toISOString()
  };
}

function localStartDaysAgo(days) {
  return dayjs().subtract(days, 'day').startOf('day').toISOString();
}

function fillDailySeries(rows, days = 14) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = dayjs().subtract(index, 'day').format('YYYY-MM-DD');
    const existing = byDate.get(date);
    series.push({
      date,
      label: dayjs(date).format('DD/MM'),
      revenue: money(existing?.revenue),
      profit: money(existing?.profit),
      sales: Number(existing?.sales || 0)
    });
  }

  return series;
}

function getDashboardAnalytics() {
  const todayRange = localDayRange();
  const thirtyDaysAgo = localStartDaysAgo(30);
  const thirteenDaysAgo = localStartDaysAgo(13);

  const todayStats = db.prepare(`
    SELECT
      COALESCE(SUM(total), 0) AS revenue,
      COALESCE(SUM(estimated_profit), 0) AS profit,
      COUNT(*) AS sales_count,
      COALESCE(AVG(total), 0) AS average_ticket
    FROM sales
    WHERE unixepoch(created_at) >= unixepoch(?)
      AND unixepoch(created_at) < unixepoch(?)
  `).get(todayRange.start, todayRange.end);

  const lowStockProducts = db.prepare(`
    SELECT
      id,
      name,
      category,
      stock_quantity,
      min_stock,
      unit,
      supplier,
      internal_code,
      expiration_date,
      CASE
        WHEN stock_quantity <= min_stock * 0.5 THEN 'critical'
        WHEN stock_quantity <= min_stock THEN 'warning'
        ELSE 'normal'
      END AS status
    FROM products
    WHERE active = 1 AND stock_quantity <= min_stock
    ORDER BY
      CASE
        WHEN stock_quantity <= min_stock * 0.5 THEN 0
        WHEN stock_quantity <= min_stock THEN 1
        ELSE 2
      END,
      stock_quantity ASC,
      name ASC
  `).all();

  const expirationAlerts = db.prepare(`
    SELECT
      p.id,
      b.id AS batch_id,
      p.name,
      p.category,
      b.quantity_available AS stock_quantity,
      p.min_stock,
      p.unit,
      p.supplier,
      p.internal_code,
      b.expiration_date,
      CAST(julianday(date(b.expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) AS days_to_expire,
      CASE
        WHEN date(b.expiration_date) < date('now', 'localtime') THEN 'expired'
        WHEN date(b.expiration_date) <= date('now', 'localtime', '+7 days') THEN 'critical'
        ELSE 'warning'
      END AS expiration_status
    FROM stock_batches b
    JOIN products p ON p.id = b.product_id
    WHERE p.active = 1
      AND b.quantity_available > 0
      AND b.expiration_date IS NOT NULL
      AND b.expiration_date != ''
      AND date(b.expiration_date) <= date('now', 'localtime', '+30 days')
    ORDER BY date(b.expiration_date) ASC, p.name ASC, b.id ASC
  `).all();

  const missingExpirationCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM stock_batches b
    JOIN products p ON p.id = b.product_id
    WHERE p.active = 1
      AND b.quantity_available > 0
      AND (b.expiration_date IS NULL OR b.expiration_date = '')
  `).get().total;

  const missingExpirationProducts = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.category,
      SUM(b.quantity_available) AS stock_quantity,
      p.min_stock,
      p.unit,
      p.supplier,
      p.internal_code,
      NULL AS expiration_date
    FROM stock_batches b
    JOIN products p ON p.id = b.product_id
    WHERE p.active = 1
      AND b.quantity_available > 0
      AND (b.expiration_date IS NULL OR b.expiration_date = '')
    GROUP BY p.id
    ORDER BY p.category, p.name
    LIMIT 20
  `).all();

  const topProducts = db.prepare(`
    SELECT
      item_name AS name,
      SUM(quantity) AS quantity,
      SUM(line_total) AS revenue,
      SUM(line_profit) AS profit
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE unixepoch(s.created_at) >= unixepoch(?)
    GROUP BY item_name
    ORDER BY quantity DESC
    LIMIT 6
  `).all(thirtyDaysAgo);

  const slowProducts = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.category,
      p.stock_quantity,
      p.min_stock,
      COALESCE(sold.quantity, 0) AS sold_quantity
    FROM products p
    LEFT JOIN (
      SELECT
        si.product_id,
        SUM(si.quantity) AS quantity
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE unixepoch(s.created_at) >= unixepoch(?)
      GROUP BY si.product_id
    ) sold ON sold.product_id = p.id
    WHERE p.active = 1 AND p.sale_price > 0
    GROUP BY p.id
    ORDER BY sold_quantity ASC, p.stock_quantity DESC
    LIMIT 6
  `).all(thirtyDaysAgo);

  const dailyRows = db.prepare(`
    SELECT
      date(created_at, 'localtime') AS date,
      SUM(total) AS revenue,
      SUM(estimated_profit) AS profit,
      COUNT(*) AS sales
    FROM sales
    WHERE unixepoch(created_at) >= unixepoch(?)
    GROUP BY date(created_at, 'localtime')
    ORDER BY date(created_at, 'localtime')
  `).all(thirteenDaysAgo);

  const stockConsumption = db.prepare(`
    SELECT
      p.name,
      p.category,
      p.unit,
      SUM(ABS(m.quantity_change)) AS quantity
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    WHERE m.type = 'sale'
      AND unixepoch(m.created_at) >= unixepoch(?)
    GROUP BY p.id, p.name, p.category, p.unit
    ORDER BY quantity DESC
    LIMIT 8
  `).all(thirteenDaysAgo);

  const categoryRevenue = db.prepare(`
    SELECT
      COALESCE(p.category, 'Combos') AS category,
      SUM(si.line_total) AS revenue,
      SUM(si.line_profit) AS profit
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE unixepoch(s.created_at) >= unixepoch(?)
    GROUP BY COALESCE(p.category, 'Combos')
    ORDER BY revenue DESC
  `).all(thirtyDaysAgo);

  const alerts = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.category,
      p.stock_quantity,
      p.min_stock,
      p.unit,
      p.supplier,
      p.internal_code,
      p.expiration_date,
      COALESCE(ABS(SUM(m.quantity_change)) / 14.0, 0) AS avg_daily_usage
    FROM products p
    LEFT JOIN inventory_movements m ON m.product_id = p.id
      AND m.type = 'sale'
      AND unixepoch(m.created_at) >= unixepoch(?)
    WHERE p.active = 1
    GROUP BY p.id
    HAVING p.stock_quantity <= p.min_stock OR avg_daily_usage > 0
    ORDER BY
      CASE
        WHEN p.stock_quantity <= p.min_stock * 0.5 THEN 0
        WHEN p.stock_quantity <= p.min_stock THEN 1
        ELSE 2
      END,
      p.stock_quantity ASC
  `).all(thirteenDaysAgo).map((item) => {
    const avgDailyUsage = Number(item.avg_daily_usage || 0);
    const daysToOut = avgDailyUsage > 0 ? item.stock_quantity / avgDailyUsage : null;
    const status = item.stock_quantity <= item.min_stock * 0.5
      ? 'critical'
      : item.stock_quantity <= item.min_stock
        ? 'warning'
        : 'normal';

    return {
      ...item,
      avg_daily_usage: avgDailyUsage,
      days_to_out: daysToOut,
      status,
      suggested_purchase: Math.max(0, Math.ceil(Math.max(item.min_stock * 2, avgDailyUsage * 7) - item.stock_quantity))
    };
  });

  const eventRevenue = db.prepare(`
    SELECT
      e.name,
      COUNT(DISTINCT e.id) AS occurrences,
      COUNT(s.id) AS sales,
      SUM(s.total) AS revenue,
      SUM(s.estimated_profit) AS profit
    FROM events e
    JOIN sales s ON s.event_id = e.id
    WHERE date(e.event_date) >= date('now', 'localtime', 'start of year')
      AND date(e.event_date) <= date('now', 'localtime')
    GROUP BY e.name
    ORDER BY revenue DESC, e.name ASC
  `).all().map((item) => ({
    ...item,
    occurrences: Number(item.occurrences || 0),
    sales: Number(item.sales || 0),
    revenue: money(item.revenue),
    profit: money(item.profit)
  }));

  const profitableProducts = db.prepare(`
    SELECT
      item_name AS name,
      SUM(line_profit) AS profit,
      SUM(quantity) AS quantity,
      CASE WHEN SUM(line_total) > 0 THEN SUM(line_profit) / SUM(line_total) ELSE 0 END AS margin
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE unixepoch(s.created_at) >= unixepoch(?)
    GROUP BY item_name
    ORDER BY profit DESC
    LIMIT 6
  `).all(thirtyDaysAgo);

  const criticalStockCount = lowStockProducts.filter((item) => item.status === 'critical').length;
  const purchaseSuggestions = alerts.filter((item) => item.suggested_purchase > 0);
  const expiredCount = expirationAlerts.filter((item) => item.expiration_status === 'expired').length;

  return {
    kpis: {
      revenue_today: money(todayStats.revenue),
      estimated_profit_today: money(todayStats.profit),
      sales_today: Number(todayStats.sales_count || 0),
      average_ticket_today: money(todayStats.average_ticket),
      low_stock_count: lowStockProducts.length,
      critical_stock_count: criticalStockCount,
      expiration_alert_count: expirationAlerts.length,
      expired_count: expiredCount,
      missing_expiration_count: Number(missingExpirationCount || 0),
      validity_attention_count: expirationAlerts.length + Number(missingExpirationCount || 0)
    },
    top_products: topProducts,
    slow_products: slowProducts,
    sales_by_day: fillDailySeries(dailyRows),
    stock_consumption: stockConsumption,
    category_revenue: categoryRevenue,
    alerts: alerts.slice(0, 10),
    low_stock_products: lowStockProducts,
    expiration_alerts: expirationAlerts,
    missing_expiration_products: missingExpirationProducts,
    purchase_suggestions: purchaseSuggestions,
    event_revenue: eventRevenue,
    profitable_products: profitableProducts
  };
}

function getPowerBiDataset() {
  const analytics = getDashboardAnalytics();

  return {
    generated_at: new Date().toISOString(),
    kpis: [analytics.kpis],
    products: db.prepare('SELECT * FROM v_products_sheet ORDER BY produto').all(),
    batches: db.prepare('SELECT * FROM v_stock_batches_sheet ORDER BY produto, date(validade), lote_id').all(),
    sales: db.prepare('SELECT * FROM v_sales_sheet ORDER BY data_hora DESC LIMIT 5000').all(),
    movements: db.prepare('SELECT * FROM v_movements_sheet ORDER BY data_hora DESC LIMIT 5000').all(),
    post_event_inventories: db.prepare('SELECT * FROM v_post_event_inventory_sheet ORDER BY registrado_em DESC LIMIT 5000').all(),
    sales_by_day: analytics.sales_by_day,
    stock_alerts: analytics.alerts,
    top_products: analytics.top_products
  };
}

module.exports = {
  getDashboardAnalytics,
  getPowerBiDataset
};
