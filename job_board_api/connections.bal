import ballerina/http;
import ballerinax/mysql;
import ballerinax/mysql.driver as _;

final mysql:Client mysqlClient = check new (mysqlHost, mysqlUser, mysqlPassword, mysqlDatabase, mysqlPort);
final http:Client jobbridgeAiClient = check new (aiGatewayUrl);
