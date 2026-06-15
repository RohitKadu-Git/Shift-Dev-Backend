-- Shift-Dev Web Solutions - Database Schema
-- Run this file to initialize the database and leads table

CREATE DATABASE IF NOT EXISTS shift_dev_web_solutions;

USE shift_dev_web_solutions;

CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255) NOT NULL,
  insta_handle VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
