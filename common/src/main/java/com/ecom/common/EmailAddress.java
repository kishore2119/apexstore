package com.ecom.common;
public final class EmailAddress {
    private EmailAddress() {}
    public static final String PATTERN="^[^\\s@]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}$";
}
