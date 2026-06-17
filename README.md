# Krung Thep Blackspots

An interactive geospatial data science dashboard that maps road accident hotspots across Bangkok and the surrounding metro area using Thailand Ministry of Transport road accident data.

## Problem

Thailand has a serious road safety challenge, and accident records are often hard for ordinary commuters to interpret. This project turns public accident data into a visual hotspot mapper and commute safety scoring tool.

## Features

- Cleans official Thai road accident CSV data using Python
- Filters invalid coordinates and standardizes Thai/English column names
- Maps accident points using React Leaflet
- Detects hotspot clusters using DBSCAN with haversine distance
- Builds a severity-weighted risk index
- Creates a commute safety score by road or district
- Allows cleaned GeoJSON upload
- Allows cleaned CSV and GeoJSON download
- Deployable as a static site through Vercel

## Tech Stack

- Python
- pandas
- scikit-learn
- DBSCAN clustering
- GeoJSON
- React
- Vite
- Leaflet
- GitHub
- Vercel

## Methodology

The Python pipeline cleans raw accident data, removes invalid latitude/longitude points, filters for Bangkok metro provinces, and calculates a severity score using deaths, injuries, vehicles, motorcycles, and pedestrians.

Hotspots are detected using DBSCAN because road accidents form irregular geographic clusters rather than neat circular groups.

The commute safety score is calculated by normalizing a weighted risk index from accident frequency, severity, and hotspot cluster count.

## Limitations

This app does not predict future accidents. It visualizes and scores recorded accident risk based on available public data. Missing reports, reporting bias, and incomplete current-year data may affect results.

## Project Name

Krung Thep Blackspots