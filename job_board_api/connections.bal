import ballerina/http;
import ballerinax/mysql;
import ballerinax/mysql.driver as _;

final mysql:Client mysqlClient = check new (mysqlHost, mysqlUser, mysqlPassword, mysqlDatabase, mysqlPort);
final http:Client jobbridgeAiClient = check new ("https://localhost:8443/jobbridge/jobbridge-ai-proxy", secureSocket = {
    enable: false
});
