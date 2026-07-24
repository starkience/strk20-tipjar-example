pub mod tipjar;
pub mod mock_erc20;

// Advanced module — private DeFi via an anonymizer contract. Reference only:
// build + tested against a mock AVNU; NOT audited, NOT for mainnet. See
// ../../docs/ANONYMIZER.md.
pub mod avnu_models;
pub mod avnu_swap_anonymizer;
pub mod mock_avnu_exchange;
