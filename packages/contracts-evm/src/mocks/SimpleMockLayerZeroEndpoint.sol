// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";

/**
 * @title SimpleMockLayerZeroEndpoint
 * @notice Simple mock LayerZero endpoint for testing purposes
 */
contract SimpleMockLayerZeroEndpoint is ILayerZeroEndpointV2 {
    uint32 public immutable eid;
    address public lzToken;
    
    constructor() {
        eid = 1; // Test endpoint ID
    }
    
    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory) {
        return MessagingFee({nativeFee: 0, lzTokenFee: 0});
    }
    
    function send(MessagingParams calldata, address) external payable returns (MessagingReceipt memory) {
        return MessagingReceipt({
            guid: bytes32(uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)))),
            nonce: 0,
            fee: MessagingFee({nativeFee: 0, lzTokenFee: 0})
        });
    }
    
    function verify(Origin calldata, address, bytes32) external pure {}
    function verifiable(Origin calldata, address) external pure returns (bool) { return true; }
    function initializable(Origin calldata, address) external pure returns (bool) { return true; }
    function lzReceive(Origin calldata _origin, address _receiver, bytes32, bytes calldata _message, bytes calldata) external payable {
        // Forward the call to the receiver contract using low-level call
        // Use the correct function signature for lzReceive
        (bool success,) = _receiver.call(
            abi.encodeWithSignature(
                "lzReceive((uint32,bytes32,uint64),bytes32,bytes,address,bytes)",
                _origin,
                bytes32(0), // guid
                _message,
                address(this), // executor
                ""
            )
        );
        require(success, "lzReceive call failed");
    }
    function clear(address, Origin calldata, bytes32, bytes calldata) external {}
    function setLzToken(address _lzToken) external { lzToken = _lzToken; }
    function nativeToken() external pure returns (address) { return address(0); }
    function setDelegate(address) external {}
    
    // Stub implementations for required interfaces
    function registerLibrary(address) external {}
    function isRegisteredLibrary(address) external pure returns (bool) { return true; }
    function getRegisteredLibraries() external view returns (address[] memory) {
        address[] memory libs = new address[](1);
        libs[0] = address(this);
        return libs;
    }
    function setDefaultSendLibrary(uint32, address) external {}
    function defaultSendLibrary(uint32) external view returns (address) { return address(this); }
    function setDefaultReceiveLibrary(uint32, address, uint256) external {}
    function defaultReceiveLibrary(uint32) external view returns (address) { return address(this); }
    function setDefaultReceiveLibraryTimeout(uint32, address, uint256) external {}
    function defaultReceiveLibraryTimeout(uint32) external view returns (address lib, uint256 expiry) {
        return (address(this), 0);
    }
    function isSupportedEid(uint32) external pure returns (bool) { return true; }
    function isValidReceiveLibrary(address, uint32, address) external pure returns (bool) { return true; }
    function setSendLibrary(address, uint32, address) external {}
    function getSendLibrary(address, uint32) external view returns (address lib) { return address(this); }
    function isDefaultSendLibrary(address, uint32) external pure returns (bool) { return true; }
    function setReceiveLibrary(address, uint32, address, uint256) external {}
    function getReceiveLibrary(address, uint32) external view returns (address lib, bool isDefault) {
        return (address(this), true);
    }
    function setReceiveLibraryTimeout(address, uint32, address, uint256) external {}
    function receiveLibraryTimeout(address, uint32) external view returns (address lib, uint256 expiry) {
        return (address(this), 0);
    }
    function setConfig(address, address, SetConfigParam[] calldata) external {}
    function getConfig(address, address, uint32, uint32) external pure returns (bytes memory config) {
        return "";
    }
    
    // IMessagingChannel methods
    function skip(address, uint32, bytes32, uint64) external {}
    function nilify(address, uint32, bytes32, uint64, bytes32) external {}
    function burn(address, uint32, bytes32, uint64, bytes32) external {}
    function nextGuid(address, uint32, bytes32) external view returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender))));
    }
    function inboundNonce(address, uint32, bytes32) external pure returns (uint64) { return 0; }
    function inboundPayloadHash(address, uint32, bytes32, uint64) external pure returns (bytes32) {
        return bytes32(0);
    }
    function outboundNonce(address, uint32, bytes32) external pure returns (uint64) { return 0; }
    function lazyInboundNonce(address, uint32, bytes32) external pure returns (uint64) { return 0; }
    
    // IMessagingComposer methods
    function sendCompose(address, bytes32, uint16, bytes calldata) external {}
    function composeQueue(address, address, bytes32, uint16) external pure returns (bytes32) {
        return bytes32(0);
    }
    function lzCompose(address, address, bytes32, uint16, bytes calldata, bytes calldata) external payable {}
    
    // IMessagingContext methods
    function isSendingMessage() external pure returns (bool) { return false; }
    function getSendContext() external view returns (uint32 dstEid, address sender) {
        return (1, address(this));
    }
}
