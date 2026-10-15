-- Queries behind the three findings in the README (run against database/mobility.db).

-- 1. Average speed by pickup hour (whole city)
SELECT pickup_hour, COUNT(*) AS trips, ROUND(AVG(avg_speed_mph), 1) AS avg_speed_mph
FROM trips
GROUP BY pickup_hour
ORDER BY pickup_hour;

-- 1b. Weekday rush hour vs. night speed, by pickup borough
SELECT b.name AS borough,
       ROUND(AVG(CASE WHEN pickup_hour BETWEEN 7 AND 9 AND is_weekend = 0 THEN avg_speed_mph END), 1) AS am_rush_mph,
       ROUND(AVG(CASE WHEN pickup_hour BETWEEN 15 AND 18 AND is_weekend = 0 THEN avg_speed_mph END), 1) AS pm_rush_mph,
       ROUND(AVG(CASE WHEN pickup_hour BETWEEN 2 AND 5 THEN avg_speed_mph END), 1) AS night_mph,
       COUNT(*) AS trips
FROM trips t
JOIN zones z ON z.location_id = t.pu_location_id
JOIN boroughs b ON b.borough_id = z.borough_id
GROUP BY b.name
ORDER BY trips DESC;

-- 2. Fare per mile by trip distance band
SELECT CASE WHEN trip_distance < 1 THEN '< 1 mi'
            WHEN trip_distance < 2 THEN '1-2 mi'
            WHEN trip_distance < 5 THEN '2-5 mi'
            WHEN trip_distance < 10 THEN '5-10 mi'
            ELSE '10+ mi' END AS distance_band,
       COUNT(*) AS trips,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM trips), 1) AS pct_of_trips,
       ROUND(AVG(fare_per_mile), 2) AS avg_fare_per_mile
FROM trips
GROUP BY distance_band
ORDER BY MIN(trip_distance);

-- 3. Airport trips: share of rides vs. share of revenue
SELECT is_airport_trip,
       COUNT(*) AS trips,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM trips), 1) AS pct_of_trips,
       ROUND(100.0 * SUM(total_amount) / (SELECT SUM(total_amount) FROM trips), 1) AS pct_of_revenue,
       ROUND(AVG(total_amount), 2) AS avg_total
FROM trips
GROUP BY is_airport_trip;
